/**
 * 스테이지 데이터 점검과 무작위 입력 시뮬레이션.
 *
 *   npm run check
 *
 * 1. 맵 크기, 쓸 수 있는 글자, 시작·열쇠·문 개수를 확인한다.
 * 2. 스테이지마다 무작위 입력으로 수만 프레임을 돌려 예외나 NaN 좌표가
 *    나오지 않는지, 멀린이 벽을 뚫고 맵 밖으로 나가지 않는지 확인한다.
 *
 * Node 22.18 이상은 TypeScript 를 그대로 불러올 수 있어서 빌드 없이 돈다.
 */
import { CHAPTERS, LEVELS, LEVEL_COLS, LEVEL_ROWS, SECRET_LEVELS } from '../src/game/levels.ts';
import { World, VIEW_W, VIEW_H } from '../src/game/world.ts';

const ALLOWED = new Set('.#oPKDk12345$jhbrgOws<>Mm');
const errors = [];

const STAGES = [
  ...LEVELS.map((level, n) => ({ tag: `스테이지 ${n + 1}`, level, runes: 1 })),
  ...SECRET_LEVELS.map((level, n) => ({ tag: `비밀 스테이지 S${n + 1}`, level, runes: 0 })),
];

STAGES.forEach(({ tag, level, runes }) => {
  if (level.map.length !== LEVEL_ROWS) errors.push(`${tag}: 행이 ${level.map.length}개 (${LEVEL_ROWS}개여야 함)`);
  const all = level.map.join('');
  level.map.forEach((row, y) => {
    if (row.length !== LEVEL_COLS) errors.push(`${tag} ${y}행: 길이 ${row.length} (${LEVEL_COLS}이어야 함)`);
    for (const ch of row) if (!ALLOWED.has(ch)) errors.push(`${tag} ${y}행: 모르는 글자 '${ch}'`);
  });
  const count = (re) => (all.match(re) ?? []).length;
  if (count(/P/g) !== 1) errors.push(`${tag}: 시작 위치(P)가 하나가 아님`);
  if (count(/[Kk]/g) !== 1) errors.push(`${tag}: 열쇠(K/k)가 하나가 아님`);
  if (count(/D/g) !== 1) errors.push(`${tag}: 문(D)이 하나가 아님`);
  if (count(/[r5]/g) !== runes) errors.push(`${tag}: 룬(r/5)이 ${runes}개여야 함`);
});

// 장 구분이 1번부터 마지막 스테이지까지 빈틈없이 이어지는지, 비밀 스테이지와 수가 맞는지
CHAPTERS.forEach((c, i) => {
  const expected = i === 0 ? 0 : CHAPTERS[i - 1].last + 1;
  if (c.first !== expected || c.last < c.first) errors.push(`${i + 1}장: 범위가 이어지지 않음`);
});
if (CHAPTERS.at(-1)?.last !== LEVELS.length - 1) errors.push('마지막 장이 마지막 스테이지에서 끝나지 않음');
if (CHAPTERS.length !== SECRET_LEVELS.length) errors.push('장 수와 비밀 스테이지 수가 다름');

// 무작위 입력으로 굴려 본다. 결과를 다시 볼 수 있게 난수는 고정한다.
let seed = 12345;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const FRAMES = 30000;
STAGES.forEach(({ tag, level }) => {
  const session = { score: 0, lives: 3, fire: 3 };
  let world = new World(level, session);
  let held = { left: false, right: false, down: false };
  for (let f = 0; f < FRAMES; f++) {
    if (f % 20 === 0) {
      held = { left: rand() < 0.4, right: rand() < 0.4, down: rand() < 0.15 };
    }
    world.step({
      ...held,
      jumpPressed: rand() < 0.04,
      magicPressed: rand() < 0.05,
      firePressed: rand() < 0.01,
    });
    const p = world.player;
    if (![p.x, p.y, p.vx, p.vy].every(Number.isFinite)) {
      errors.push(`${tag}: ${f}프레임에 좌표가 숫자가 아님`);
      break;
    }
    if (p.x < 16 || p.y < 16 || p.x + p.w > VIEW_W - 16 || p.y + p.h > VIEW_H - 16) {
      errors.push(`${tag}: ${f}프레임에 멀린이 맵 밖 (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
      break;
    }
    if (world.isDyingDone || world.isClearDone) world = new World(level, session);
  }
});

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`스테이지 ${STAGES.length}개(비밀 ${SECRET_LEVELS.length}개 포함) 점검 완료 (스테이지마다 ${FRAMES}프레임 시뮬레이션)`);
