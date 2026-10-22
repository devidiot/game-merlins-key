/**
 * 스테이지마다 실제로 깰 수 있는지 탐색으로 확인한다.
 *
 *   node scripts/solve-levels.mjs        모든 스테이지
 *   node scripts/solve-levels.mjs 4 7    고른 스테이지만
 *   node scripts/solve-levels.mjs 4 --save   찾은 길을 routes.json 에 저장
 *   NODE_LIMIT=300000 GOAL_WEIGHT=0.8 node scripts/solve-levels.mjs 4   탐색 폭 조절
 *   node scripts/solve-levels.mjs --verify            routes.json 의 길을 다시 따라가 확인
 *   node scripts/solve-levels.mjs --run 1 walk-R ...  동작을 하나씩 실행하며 위치 출력
 *
 * 진짜 엔진(World)을 그대로 쓰고, 사람이 하는 동작을 묶은 "큰 동작"
 * (한 칸 걷기, 제자리·좌우 점프, 마법, 웅크려 마법)을 이어 붙여 문까지 가는
 * 길을 찾는다. 적은 지운다. 적 없이도 못 깨면 지형이 잘못된 것이기 때문이다.
 * 대신 탐색이 너무 쉬워지지 않도록 제한 시간은 그대로 둔다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { LEVELS } from '../src/game/levels.ts';
import { World, TILE } from '../src/game/world.ts';

const NODE_LIMIT = Number(process.env.NODE_LIMIT ?? 120000);
/** 목표까지 거리에 거는 무게. 크면 욕심껏 다가가고, 작으면 넓게 둘러본다. */
const GOAL_WEIGHT = Number(process.env.GOAL_WEIGHT ?? 2);
const IDLE = { left: false, right: false, down: false, jumpPressed: false, magicPressed: false, firePressed: false };

/** 탐색에 필요한 상태만 빠르게 복사한다 (적과 효과는 비어 있다) */
function clone(w) {
  const c = Object.create(World.prototype);
  Object.assign(c, w);
  c.session = { ...w.session };
  c.tiles = w.tiles.slice();
  c.hp = w.hp.slice();
  c.hidden = w.hidden.slice();
  c.player = { ...w.player };
  c.items = w.items.map((it) => ({ ...it }));
  c.door = { ...w.door };
  c.aim = { ...w.aim };
  c.shots = [];
  c.fairies = [];
  c.particles = [];
  c.events = [];
  return c;
}

/** f 값이 작은 것부터 꺼내는 이진 힙 */
class Heap {
  items = [];
  get size() {
    return this.items.length;
  }
  push(x) {
    const a = this.items;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (a[up].f <= a[i].f) break;
      [a[up], a[i]] = [a[i], a[up]];
      i = up;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** 프레임을 진행하다 땅에 서면 멈춘다. 죽거나 클리어하면 그것도 알려 준다. */
function settle(w, maxFrames = 120) {
  for (let i = 0; i < maxFrames; i++) {
    if (w.player.onGround && w.player.vy === 0) return true;
    w.step(IDLE);
    if (w.state !== 'play') return true;
  }
  return w.player.onGround;
}

function hold(w, input, frames) {
  for (let i = 0; i < frames; i++) {
    w.step({ ...IDLE, ...input });
    if (w.state !== 'play') return;
  }
}

const MACROS = [
  ['walk-L', (w) => walk(w, -1)],
  ['walk-R', (w) => walk(w, 1)],
  ['jump', (w) => jump(w, 0, 0)],
  ['jump-L1', (w) => jump(w, -1, 12)],
  ['jump-R1', (w) => jump(w, 1, 12)],
  ['jump-L2', (w) => jump(w, -1, 24)],
  ['jump-R2', (w) => jump(w, 1, 24)],
  ['jump-L3', (w) => jump(w, -1, 40)],
  ['jump-R3', (w) => jump(w, 1, 40)],
  ['jumpLate-L', (w) => jumpLate(w, -1)],
  ['jumpLate-R', (w) => jumpLate(w, 1)],
  ['center', (w) => center(w)],
  ['jumpCast-L', (w) => jumpCast(w, -1)],
  ['jumpCast-R', (w) => jumpCast(w, 1)],
  ['cast-L', (w) => cast(w, -1, false)],
  ['cast-R', (w) => cast(w, 1, false)],
  ['crouch-L', (w) => cast(w, -1, true)],
  ['crouch-R', (w) => cast(w, 1, true)],
];

/** 다음 칸 가운데까지 걷는다 (떨어지면 착지까지) */
function walk(w, dir) {
  const p = w.player;
  const startCol = Math.floor((p.x + p.w / 2) / TILE);
  const target = (startCol + dir) * TILE + 8;
  for (let i = 0; i < 40; i++) {
    const c = p.x + p.w / 2;
    if ((dir > 0 && c >= target) || (dir < 0 && c <= target)) break;
    w.step({ ...IDLE, left: dir < 0, right: dir > 0 });
    if (w.state !== 'play') return;
  }
  settle(w);
}

/** 발 밑 칸의 가운데로 조금 걸어 선다 (블록 끝에 걸쳐 섰을 때) */
function center(w) {
  const p = w.player;
  const col = Math.floor((p.x + p.w / 2) / TILE);
  const target = col * TILE + 8;
  for (let i = 0; i < 12; i++) {
    const c = p.x + p.w / 2;
    if (Math.abs(c - target) < 1) break;
    w.step({ ...IDLE, left: c > target, right: c < target });
    if (w.state !== 'play') return;
  }
  settle(w);
}

function jump(w, dir, frames) {
  w.step({ ...IDLE, jumpPressed: true, left: dir < 0, right: dir > 0 });
  hold(w, { left: dir < 0, right: dir > 0 }, frames);
  settle(w);
}

/** 제자리에서 뛰어 꼭대기 근처에서 마법 (한 칸 위 옆 블록을 만들거나 부술 때) */
function jumpCast(w, dir) {
  w.step({ ...IDLE, down: true, left: dir < 0, right: dir > 0 });
  hold(w, {}, 13);
  w.step({ ...IDLE, jumpPressed: true });
  hold(w, {}, 16);
  w.step({ ...IDLE, magicPressed: true });
  settle(w);
}

/** 제자리에서 뛰어 꼭대기 근처에서 옆으로 (바로 위 선반에 오를 때) */
function jumpLate(w, dir) {
  w.step({ ...IDLE, jumpPressed: true });
  hold(w, {}, 14);
  hold(w, { left: dir < 0, right: dir > 0 }, 18);
  settle(w);
}

function cast(w, dir, isCrouch) {
  // 방향 돌리기 (웅크리면 제자리)
  w.step({ ...IDLE, down: true, left: dir < 0, right: dir > 0 });
  if (!isCrouch) w.step({ ...IDLE });
  hold(w, { down: isCrouch }, 13);
  w.step({ ...IDLE, down: isCrouch, magicPressed: true });
  hold(w, { down: isCrouch }, 2);
  settle(w);
}

/** 방문 확인용 해시. 위치는 칸 단위로 뭉뚱그린다. */
function key(w) {
  const p = w.player;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const mixIn = (v) => {
    h1 = Math.imul(h1 ^ v, 0x01000193);
    h2 = Math.imul(h2 ^ v, 0x5bd1e995) + 0x9e3779b9;
  };
  mixIn(Math.round(p.x / 16));
  mixIn(Math.round(p.y / 16));
  mixIn(w.hasKey ? 1 : 0);
  // 지형은 멀린 둘레 7 × 7 칸만 본다. 가지치기가 거칠어지지만 찾은 길은
  // 진짜 엔진으로 따라간 결과라서 틀린 길을 맞다고 할 일은 없다.
  const cx = Math.floor((p.x + p.w / 2) / TILE);
  const cy = Math.floor((p.y + p.h / 2) / TILE);
  for (let y = cy - 3; y <= cy + 3; y++) {
    for (let x = cx - 3; x <= cx + 3; x++) mixIn(w.tileAt(x, y));
  }
  mixIn(w.items.length);
  return (h1 >>> 0) * 0x100000 + ((h2 >>> 0) & 0xfffff);
}

function goal(w) {
  const p = w.player;
  const t = w.hasKey ? w.door : w.items.find((i) => i.kind === 'key') ?? hiddenKey(w);
  if (!t) return 0;
  // 열쇠를 아직 못 얻었으면 큰 벌점을 더해, 열쇠를 얻은 상태가 늘 앞서게 한다
  const dist = Math.abs((p.x + 6) / TILE - t.tx - 0.5) + Math.abs((p.y + 8) / TILE - t.ty - 0.5);
  return dist + (w.hasKey ? 0 : 30);
}

function hiddenKey(w) {
  const i = w.hidden.indexOf('key');
  if (i < 0) return null;
  return { tx: i % 17, ty: Math.floor(i / 17) };
}

function solve(n) {
  const start = new World(n, { score: 0, lives: 3, fire: 0 });
  start.enemies = [];
  start.mirrors = [];
  settle(start);

  // 경로는 부모를 가리키는 연결로만 남겨 메모리를 아낀다
  const pathOf = (node, last) => {
    const out = [last];
    for (let x = node; x && x.name; x = x.parent) out.push(x.name);
    return out.reverse();
  };

  // 가장 가망 있는 상태부터 펼친다 (깊이 + 목표까지 거리)
  const open = new Heap();
  open.push({ w: start, parent: null, name: null, depth: 0, f: goal(start) });
  const seen = new Set([key(start)]);
  let nodes = 0;
  while (open.size && nodes < NODE_LIMIT) {
    const cur = open.pop();
    nodes++;
    for (const [name, fn] of MACROS) {
      const w = clone(cur.w);
      fn(w);
      if (w.state === 'clear') return { path: pathOf(cur, name), nodes, timeLeft: Math.round(w.timeLeft / 60) };
      if (w.state !== 'play') continue;
      const k = key(w);
      if (seen.has(k)) continue;
      seen.add(k);
      // 숨은 아이템 배열은 바뀌지 않았으면 부모 것을 함께 쓴다
      if (w.hidden.every((v, i) => v === cur.w.hidden[i])) w.hidden = cur.w.hidden;
      const depth = cur.depth + 1;
      open.push({ w, parent: cur, name, depth, f: depth * 0.15 + goal(w) * GOAL_WEIGHT });
    }
  }
  return { path: null, nodes };
}

// 저장해 둔 길(scripts/routes.json)을 다시 따라가 모든 스테이지가 여전히 깨지는지 본다.
// 물리나 맵을 고쳤을 때 깨지 못하게 된 스테이지를 빌드 전에 잡는다.
if (process.argv[2] === '--verify') {
  const routes = JSON.parse(readFileSync(new URL('./routes.json', import.meta.url), 'utf8'));
  const table = Object.fromEntries(MACROS);
  const broken = [];
  LEVELS.forEach((_, n) => {
    const route = routes[String(n + 1)];
    if (!route) {
      broken.push(`스테이지 ${n + 1}: 저장된 길이 없음`);
      return;
    }
    const w = new World(n, { score: 0, lives: 3, fire: 0 });
    w.enemies = [];
    w.mirrors = [];
    settle(w);
    for (const name of route.split(' ')) {
      if (w.state !== 'play') break;
      table[name](w);
    }
    if (w.state !== 'clear') broken.push(`스테이지 ${n + 1}: 저장된 길로 깨지 못함 (node scripts/solve-levels.mjs ${n + 1} 로 새 길을 찾으세요)`);
  });
  if (broken.length) {
    console.error(broken.join('\n'));
    process.exit(1);
  }
  console.log(`스테이지 ${LEVELS.length}개 모두 저장된 길로 클리어 확인 (적 제외)`);
  process.exit(0);
}

// 디버그: node scripts/solve-levels.mjs --run 1 walk-R walk-R cast-L ...
if (process.argv[2] === '--run') {
  const w = new World(Number(process.argv[3]) - 1, { score: 0, lives: 3, fire: 0 });
  w.enemies = [];
  w.mirrors = [];
  settle(w);
  const table = Object.fromEntries(MACROS);
  const cell = () => `(${Math.floor((w.player.x + 6) / TILE) - 1},${Math.floor((w.player.y + 14) / TILE) - 1})`;
  console.log('시작', cell());
  for (const name of process.argv.slice(4)) {
    table[name](w);
    console.log(name.padEnd(11), cell(), w.state, w.hasKey ? '열쇠' : '', w.player.onGround ? '' : '공중');
  }
  process.exit(0);
}

function saveRoute(stage, route) {
  const file = new URL('./routes.json', import.meta.url);
  const routes = JSON.parse(readFileSync(file, 'utf8'));
  routes[String(stage)] = route;
  const sorted = Object.fromEntries(Object.entries(routes).sort((a, b) => Number(a[0]) - Number(b[0])));
  writeFileSync(file, JSON.stringify(sorted, null, 2) + '\n');
}

const pick = process.argv.slice(2).map(Number).filter(Boolean);
const targets = pick.length ? pick.map((n) => n - 1) : LEVELS.map((_, n) => n);
let isFailed = false;
for (const n of targets) {
  const t0 = performance.now();
  const r = solve(n);
  const ms = Math.round(performance.now() - t0);
  if (r.path) {
    console.log(`스테이지 ${n + 1}: 풀림 — 동작 ${r.path.length}개, 남은 시간 ${r.timeLeft}초 (탐색 ${r.nodes}, ${ms}ms)`);
    console.log(`  ${r.path.join(' ')}`);
    // --save 를 주면 찾은 길을 routes.json 에 바로 적는다
    if (process.argv.includes('--save')) saveRoute(n + 1, r.path.join(' '));
  } else {
    isFailed = true;
    console.log(`스테이지 ${n + 1}: 못 찾음 (탐색 ${r.nodes}, ${ms}ms)`);
  }
}
process.exit(isFailed ? 1 : 0);
