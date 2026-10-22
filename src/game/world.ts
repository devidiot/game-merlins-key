/**
 * 한 스테이지의 상태와 규칙.
 *
 * DOM 을 전혀 모르는 순수 로직이라 Node 에서도 그대로 돌릴 수 있다
 * (`scripts/check-levels.mjs` 가 모든 스테이지를 무작위 입력으로 돌려 본다).
 * 화면은 `render/renderer.ts` 가 이 상태를 읽어서 그린다.
 *
 * 좌표 단위는 픽셀이고 한 칸은 16px 이다. 맵 바깥에는 단단한 벽 한 줄이
 * 둘러져 있어서 전체 격자는 17 × 14 칸이다.
 */
import { LEVELS, LEVEL_COLS, LEVEL_ROWS, type LevelDef } from './levels.ts';

export const TILE = 16;
export const GRID_W = LEVEL_COLS + 2;
export const GRID_H = LEVEL_ROWS + 2;
export const VIEW_W = GRID_W * TILE;
export const VIEW_H = GRID_H * TILE;

export const EMPTY = 0;
export const WALL = 1;
export const STONE = 2;

// 멀린의 몸놀림. 60fps 한 프레임 기준이다.
const WALK_SPEED = 1.35;
const GRAVITY = 0.19;
const JUMP_SPEED = 3.85;
const MAX_FALL = 3.6;
/** 발판에서 떨어진 직후에도 점프를 받아 주는 프레임 수 */
const COYOTE_FRAMES = 6;
/** 착지 직전에 누른 점프를 기억하는 프레임 수 */
const JUMP_BUFFER_FRAMES = 8;
const CAST_COOLDOWN = 12;
/** 머리를 박으면서 모서리에 살짝 걸렸을 때 옆으로 밀어 주는 최대 거리 */
const CORNER_NUDGE = 5;

const FIREBALL_SPEED = 2.6;
const ENEMY_SHOT_SPEED = 1.5;
const TURRET_INTERVAL = 170;
const MIRROR_INTERVAL = 260;
const MIRROR_MAX_ALIVE = 3;
const FAIRY_LIFE = 600;

const MAX_LIVES = 9;
const MAX_FIRE = 5;
const DYING_FRAMES = 100;

export type ItemKind = 'key' | 'gem' | 'jar' | 'hourglass' | 'bell' | 'rune';
export type EnemyKind = 'goblin' | 'ogre' | 'wisp' | 'spark' | 'turret';

export type GameEvent =
  | 'jump'
  | 'create'
  | 'break'
  | 'fizzle'
  | 'bump'
  | 'key'
  | 'gem'
  | 'jar'
  | 'hourglass'
  | 'bell'
  | 'rune'
  | 'fairy'
  | 'fire'
  | 'kill'
  | 'shoot'
  | 'spawn'
  | 'die'
  | 'door'
  | 'clear'
  | 'hurry';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Player extends Box {
  vx: number;
  vy: number;
  facing: 1 | -1;
  onGround: boolean;
  isCrouching: boolean;
  coyote: number;
  jumpBuffer: number;
  castTimer: number;
  /** 지팡이를 휘두르는 그림을 보여 줄 남은 프레임 */
  castPose: number;
  walkTime: number;
}

export interface Enemy extends Box {
  kind: EnemyKind;
  dir: 1 | -1;
  vy: number;
  isAlive: boolean;
  timer: number;
  /** 거울이 불러낸 적인지. 거울은 살아 있는 자기 적의 수만 센다. */
  isSpawned: boolean;
  // 스파크 전용: 지금 칸, 진행 방향, 다음 칸까지의 진행률
  cx: number;
  cy: number;
  dx: number;
  dy: number;
  progress: number;
}

export interface Item {
  kind: ItemKind;
  tx: number;
  ty: number;
  /** 블록에서 막 튀어나온 연출용 프레임 */
  pop: number;
}

export interface Shot extends Box {
  vx: number;
  isFromPlayer: boolean;
}

export interface Mirror {
  tx: number;
  ty: number;
  kind: 'goblin' | 'wisp';
  timer: number;
}

export interface Fairy extends Box {
  age: number;
  baseX: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  hasGravity: boolean;
}

/** 스테이지 바깥에서도 유지되는 값. 목숨과 점수는 스테이지를 넘어 이어진다. */
export interface Session {
  score: number;
  lives: number;
  fire: number;
}

export interface InputFrame {
  left: boolean;
  right: boolean;
  down: boolean;
  jumpPressed: boolean;
  magicPressed: boolean;
  firePressed: boolean;
}

export type WorldState = 'play' | 'dying' | 'clear';

const ITEM_SCORE: Record<ItemKind, number> = {
  key: 1000,
  gem: 500,
  jar: 200,
  hourglass: 200,
  bell: 300,
  rune: 2000,
};

const HIDDEN_ITEMS: Record<string, ItemKind> = {
  k: 'key',
  '1': 'gem',
  '2': 'jar',
  '3': 'hourglass',
  '4': 'bell',
  '5': 'rune',
};

const VISIBLE_ITEMS: Record<string, ItemKind> = {
  K: 'key',
  $: 'gem',
  j: 'jar',
  h: 'hourglass',
  b: 'bell',
  r: 'rune',
};

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** 판정을 너그럽게 하려고 상자를 안쪽으로 줄인다 */
const shrink = (b: Box, by: number): Box => ({
  x: b.x + by,
  y: b.y + by,
  w: b.w - by * 2,
  h: b.h - by * 2,
});

export class World {
  readonly levelIndex: number;
  readonly level: LevelDef;
  readonly session: Session;

  tiles = new Uint8Array(GRID_W * GRID_H);
  /** 돌 블록의 남은 내구도. 박치기 한 번에 1씩 준다. */
  hp = new Uint8Array(GRID_W * GRID_H);
  hidden: (ItemKind | null)[] = new Array(GRID_W * GRID_H).fill(null);

  player!: Player;
  enemies: Enemy[] = [];
  items: Item[] = [];
  shots: Shot[] = [];
  mirrors: Mirror[] = [];
  fairies: Fairy[] = [];
  particles: Particle[] = [];

  door = { tx: 0, ty: 0, isOpen: false, openAnim: 0 };
  hasKey = false;
  hasRune = false;
  /** 남은 시간(프레임) */
  timeLeft: number;
  state: WorldState = 'play';
  stateTimer = 0;
  frame = 0;
  /** 마법이 닿는 칸 (화면에 옅게 표시한다) */
  aim = { tx: 0, ty: 0, isValid: false };

  private events: GameEvent[] = [];

  constructor(levelIndex: number, session: Session) {
    this.levelIndex = levelIndex;
    this.level = LEVELS[levelIndex];
    this.session = session;
    this.timeLeft = this.level.time * 60;
    this.load();
  }

  // ---------------------------------------------------------------- 불러오기

  private load(): void {
    this.tiles.fill(WALL);
    let start = { tx: 1, ty: LEVEL_ROWS };

    this.level.map.forEach((row, ly) => {
      for (let lx = 0; lx < LEVEL_COLS; lx++) {
        const ch = row[lx] ?? '.';
        const tx = lx + 1;
        const ty = ly + 1;
        const i = ty * GRID_W + tx;
        this.tiles[i] = EMPTY;

        if (ch === '#') {
          this.tiles[i] = WALL;
        } else if (ch === 'o' || ch in HIDDEN_ITEMS) {
          this.tiles[i] = STONE;
          this.hp[i] = 2;
          if (ch in HIDDEN_ITEMS) this.hidden[i] = HIDDEN_ITEMS[ch];
        } else if (ch in VISIBLE_ITEMS) {
          this.items.push({ kind: VISIBLE_ITEMS[ch], tx, ty, pop: 0 });
        } else if (ch === 'P') {
          start = { tx, ty };
        } else if (ch === 'D') {
          this.door.tx = tx;
          this.door.ty = ty;
        } else if (ch === 'g') {
          this.addWalker('goblin', tx, ty, -1, false);
        } else if (ch === 'O') {
          this.addWalker('ogre', tx, ty, -1, false);
        } else if (ch === 'w') {
          this.addWisp(tx, ty, -1, false);
        } else if (ch === 's') {
          this.addSpark(tx, ty);
        } else if (ch === '<' || ch === '>') {
          this.addTurret(tx, ty, ch === '<' ? -1 : 1);
        } else if (ch === 'M' || ch === 'm') {
          this.mirrors.push({ tx, ty, kind: ch === 'M' ? 'goblin' : 'wisp', timer: 120 });
        }
      }
    });

    this.player = {
      x: start.tx * TILE + 2,
      y: start.ty * TILE + 1,
      w: 12,
      h: 15,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: false,
      isCrouching: false,
      coyote: 0,
      jumpBuffer: 0,
      castTimer: 0,
      castPose: 0,
      walkTime: 0,
    };
  }

  private baseEnemy(kind: EnemyKind, tx: number, ty: number, dir: 1 | -1, isSpawned: boolean): Enemy {
    return {
      kind,
      dir,
      x: tx * TILE + 2,
      y: ty * TILE + 2,
      w: 12,
      h: 14,
      vy: 0,
      isAlive: true,
      timer: 0,
      isSpawned,
      cx: tx,
      cy: ty,
      dx: 0,
      dy: 0,
      progress: 0,
    };
  }

  private addWalker(kind: 'goblin' | 'ogre', tx: number, ty: number, dir: 1 | -1, isSpawned: boolean): void {
    this.enemies.push(this.baseEnemy(kind, tx, ty, dir, isSpawned));
  }

  private addWisp(tx: number, ty: number, dir: 1 | -1, isSpawned: boolean): void {
    const e = this.baseEnemy('wisp', tx, ty, dir, isSpawned);
    e.y = ty * TILE + 2;
    e.h = 12;
    this.enemies.push(e);
  }

  private addSpark(tx: number, ty: number): void {
    const e = this.baseEnemy('spark', tx, ty, 1, false);
    e.w = 10;
    e.h = 10;
    // 오른쪽에 벽을 끼고 나아갈 수 있는 방향을 고른다
    const dirs = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ];
    const pick =
      dirs.find(([dx, dy]) => this.isSolid(tx - dy, ty + dx) && !this.isSolid(tx + dx, ty + dy)) ??
      dirs.find(([dx, dy]) => !this.isSolid(tx + dx, ty + dy)) ??
      [1, 0];
    e.dx = pick[0];
    e.dy = pick[1];
    this.placeSpark(e);
    this.enemies.push(e);
  }

  private addTurret(tx: number, ty: number, dir: 1 | -1): void {
    const e = this.baseEnemy('turret', tx, ty, dir, false);
    e.x = tx * TILE + 1;
    e.y = ty * TILE + 1;
    e.w = 14;
    e.h = 14;
    // 시작하자마자 쏘지 않도록 여유를 준다
    e.timer = TURRET_INTERVAL + 60;
    this.enemies.push(e);
  }

  // ---------------------------------------------------------------- 격자 도구

  tileAt(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return WALL;
    return this.tiles[ty * GRID_W + tx];
  }

  isSolid(tx: number, ty: number): boolean {
    return this.tileAt(tx, ty) !== EMPTY;
  }

  private boxHitsSolid(x: number, y: number, w: number, h: number): boolean {
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w - 0.001) / TILE);
    const y0 = Math.floor(y / TILE);
    const y1 = Math.floor((y + h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.isSolid(tx, ty)) return true;
      }
    }
    return false;
  }

  /** 가로로 움직이고, 벽에 막히면 막힌 열 번호를 돌려준다 */
  private moveX(b: Box, dx: number): number | null {
    if (dx === 0) return null;
    b.x += dx;
    if (!this.boxHitsSolid(b.x, b.y, b.w, b.h)) return null;
    if (dx > 0) {
      const col = Math.floor((b.x + b.w - 0.001) / TILE);
      b.x = col * TILE - b.w;
      return col;
    }
    const col = Math.floor(b.x / TILE);
    b.x = (col + 1) * TILE;
    return col;
  }

  /** 세로로 움직이고, 막히면 막힌 행 번호를 돌려준다 */
  private moveY(b: Box, dy: number): number | null {
    if (dy === 0) return null;
    b.y += dy;
    if (!this.boxHitsSolid(b.x, b.y, b.w, b.h)) return null;
    if (dy > 0) {
      const row = Math.floor((b.y + b.h - 0.001) / TILE);
      b.y = row * TILE - b.h;
      return row;
    }
    const row = Math.floor(b.y / TILE);
    b.y = (row + 1) * TILE;
    return row;
  }

  private isStandingOnSolid(b: Box): boolean {
    return this.boxHitsSolid(b.x, b.y + b.h, b.w, 1);
  }

  // ---------------------------------------------------------------- 진행

  /** 한 프레임 진행하고 그동안 생긴 이벤트를 돌려준다 */
  step(input: InputFrame): GameEvent[] {
    this.events = [];
    this.frame++;

    if (this.state === 'play') {
      this.updatePlayer(input);
      this.updateEnemies();
      this.updateMirrors();
      this.updateShots();
      this.updateFairies();
      this.checkPickups();
      this.checkDanger();
      this.checkDoor();
      this.tickTime();
      this.updateAim();
    } else if (this.state === 'dying') {
      this.stateTimer--;
      this.updateEnemies();
      this.updateShots();
    } else {
      this.stateTimer--;
    }

    if (this.door.isOpen && this.door.openAnim < 1) {
      this.door.openAnim = Math.min(1, this.door.openAnim + 0.05);
    }
    for (const it of this.items) if (it.pop > 0) it.pop--;
    this.updateParticles();
    return this.events;
  }

  private emit(e: GameEvent): void {
    this.events.push(e);
  }

  private tickTime(): void {
    const before = Math.ceil(this.timeLeft / 60);
    this.timeLeft--;
    const after = Math.ceil(this.timeLeft / 60);
    if (after !== before && after <= 10 && after > 0) this.emit('hurry');
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.kill();
    }
  }

  // ---------------------------------------------------------------- 멀린

  private updatePlayer(input: InputFrame): void {
    const p = this.player;

    p.isCrouching = p.onGround && input.down;
    let move = 0;
    if (input.left) move -= 1;
    if (input.right) move += 1;
    if (move !== 0) p.facing = move > 0 ? 1 : -1;
    // 웅크린 동안에는 방향만 바꾸고 제자리에 있는다 (마법 조준용)
    p.vx = p.isCrouching ? 0 : move * WALK_SPEED;
    if (p.vx !== 0 && p.onGround) p.walkTime++;

    if (input.jumpPressed) p.jumpBuffer = JUMP_BUFFER_FRAMES;
    if (p.jumpBuffer > 0) {
      p.jumpBuffer--;
      if (p.coyote > 0) {
        p.vy = -JUMP_SPEED;
        p.coyote = 0;
        p.jumpBuffer = 0;
        p.onGround = false;
        p.isCrouching = false;
        this.emit('jump');
      }
    }
    p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);

    this.moveX(p, p.vx);

    if (p.vy < 0) {
      const startY = p.y;
      const targetY = p.y + p.vy;
      const row = this.moveY(p, p.vy);
      if (row !== null) {
        // 모서리에 살짝 걸렸으면 옆으로 밀어 주고 계속 오르게 한다
        const blockedY = p.y;
        p.y = startY;
        if (!this.tryCornerNudge(p, targetY)) {
          p.y = blockedY;
          this.headbutt(row);
          p.vy = 0.4;
        }
      }
    } else {
      const row = this.moveY(p, p.vy);
      if (row !== null) p.vy = 0;
    }

    p.onGround = p.vy >= 0 && this.isStandingOnSolid(p);
    if (p.onGround) {
      p.vy = 0;
      p.coyote = COYOTE_FRAMES;
    } else if (p.coyote > 0) {
      p.coyote--;
    }
    if (!p.onGround) p.isCrouching = false;

    if (p.castTimer > 0) p.castTimer--;
    if (p.castPose > 0) p.castPose--;
    if (input.magicPressed && p.castTimer === 0) this.castMagic();
    if (input.firePressed) this.throwFire();
  }

  /**
   * 머리가 블록 모서리에 조금만 걸렸을 때 옆으로 비켜 준다.
   * 성공하면 원래 가려던 높이까지 올려 놓고 true 를 돌려준다.
   */
  private tryCornerNudge(p: Player, targetY: number): boolean {
    for (let n = 1; n <= CORNER_NUDGE; n++) {
      for (const sign of [-1, 1]) {
        const nx = p.x + n * sign;
        if (!this.boxHitsSolid(nx, targetY, p.w, p.h)) {
          p.x = nx;
          p.y = targetY;
          return true;
        }
      }
    }
    return false;
  }

  /** 아래에서 머리로 들이받은 돌 블록에 금이 가고, 두 번째에 깨진다 */
  private headbutt(row: number): void {
    const p = this.player;
    const col = Math.floor((p.x + p.w / 2) / TILE);
    // 머리 가운데 위가 비었으면 더 많이 겹친 옆 칸을 친다
    const cols = [col, Math.floor(p.x / TILE), Math.floor((p.x + p.w - 0.001) / TILE)];
    const tx = cols.find((c) => this.isSolid(c, row));
    if (tx === undefined) return;
    const i = row * GRID_W + tx;
    if (this.tiles[i] === STONE) {
      this.hp[i]--;
      if (this.hp[i] <= 0) {
        this.breakStone(tx, row);
      } else {
        this.burst(tx * TILE + 8, row * TILE + 14, '#e8a060', 4);
        this.emit('bump');
      }
    } else {
      this.emit('bump');
    }
  }

  /** 마법이 닿는 칸. 웅크리면 발 앞 아래 칸을 노린다. */
  private aimTile(): { tx: number; ty: number } {
    const p = this.player;
    const col = Math.floor((p.x + p.w / 2) / TILE) + p.facing;
    let row = p.onGround ? Math.floor((p.y + p.h - 1) / TILE) : Math.floor((p.y + p.h / 2) / TILE);
    if (p.isCrouching) row += 1;
    return { tx: col, ty: row };
  }

  private updateAim(): void {
    const { tx, ty } = this.aimTile();
    this.aim.tx = tx;
    this.aim.ty = ty;
    const inside = tx >= 1 && ty >= 1 && tx <= LEVEL_COLS && ty <= LEVEL_ROWS;
    this.aim.isValid = inside && this.tileAt(tx, ty) !== WALL;
  }

  private castMagic(): void {
    const p = this.player;
    p.castTimer = CAST_COOLDOWN;
    p.castPose = 10;
    const { tx, ty } = this.aimTile();
    const inside = tx >= 1 && ty >= 1 && tx <= LEVEL_COLS && ty <= LEVEL_ROWS;
    const tile = this.tileAt(tx, ty);

    if (!inside || tile === WALL) {
      this.fizzle(tx, ty);
      return;
    }
    if (tile === STONE) {
      this.breakStone(tx, ty);
      return;
    }

    const cell: Box = { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };

    // 멀린이 목표 칸을 조금 침범했으면 뒤로 물러서게 하고 블록을 만든다
    if (overlaps(p, cell)) {
      const push = p.facing > 0 ? p.x + p.w - cell.x : cell.x + TILE - p.x;
      const backX = p.x - push * p.facing;
      if (push <= 7 && !this.boxHitsSolid(backX, p.y, p.w, p.h)) {
        p.x = backX;
      } else {
        this.fizzle(tx, ty);
        return;
      }
    }

    const isBlocked =
      this.enemies.some((e) => e.isAlive && overlaps(e, cell)) ||
      this.items.some((it) => it.tx === tx && it.ty === ty) ||
      (this.door.tx === tx && this.door.ty === ty) ||
      this.mirrors.some((m) => m.tx === tx && m.ty === ty) ||
      this.shots.some((s) => overlaps(s, cell));
    if (isBlocked) {
      this.fizzle(tx, ty);
      return;
    }

    const i = ty * GRID_W + tx;
    this.tiles[i] = STONE;
    this.hp[i] = 2;
    this.sparkle(tx * TILE + 8, ty * TILE + 8);
    this.emit('create');
  }

  private fizzle(tx: number, ty: number): void {
    this.burst(tx * TILE + 8, ty * TILE + 8, '#8f7cff', 4);
    this.emit('fizzle');
  }

  breakStone(tx: number, ty: number): void {
    const i = ty * GRID_W + tx;
    if (this.tiles[i] !== STONE) return;
    this.tiles[i] = EMPTY;
    this.hp[i] = 0;
    this.burst(tx * TILE + 8, ty * TILE + 8, '#d9874a', 10);
    const kind = this.hidden[i];
    if (kind) {
      this.hidden[i] = null;
      this.items.push({ kind, tx, ty, pop: 20 });
      this.sparkle(tx * TILE + 8, ty * TILE + 8);
    }
    this.emit('break');
  }

  private throwFire(): void {
    const p = this.player;
    if (this.session.fire <= 0) {
      this.emit('fizzle');
      return;
    }
    if (this.shots.some((s) => s.isFromPlayer)) return;
    this.session.fire--;
    p.castPose = 10;
    this.shots.push({
      x: p.x + p.w / 2 - 4 + p.facing * 6,
      y: p.y + 4,
      w: 8,
      h: 8,
      vx: FIREBALL_SPEED * p.facing,
      isFromPlayer: true,
    });
    this.emit('fire');
  }

  // ---------------------------------------------------------------- 적

  private updateEnemies(): void {
    for (const e of this.enemies) {
      if (!e.isAlive) continue;
      switch (e.kind) {
        case 'goblin':
        case 'ogre':
          this.updateWalker(e);
          break;
        case 'wisp':
          this.updateWisp(e);
          break;
        case 'spark':
          this.updateSpark(e);
          break;
        case 'turret':
          this.updateTurret(e);
          break;
      }
    }
    if (this.enemies.length > 40) this.enemies = this.enemies.filter((e) => e.isAlive);
  }

  private updateWalker(e: Enemy): void {
    e.vy = Math.min(e.vy + GRAVITY, MAX_FALL);
    const landed = this.moveY(e, e.vy);
    if (landed !== null) e.vy = 0;
    const isGrounded = e.vy === 0 && this.isStandingOnSolid(e);
    if (!isGrounded) return; // 떨어지는 동안에는 옆으로 가지 않는다

    // 오우거는 앞을 막은 돌 블록 앞에서 잠깐 멈췄다가 부순다
    if (e.timer > 0) {
      e.timer--;
      if (e.timer === 0) {
        const col = e.dir > 0 ? Math.floor((e.x + e.w) / TILE) : Math.floor((e.x - 1) / TILE);
        const rows = [Math.floor(e.y / TILE), Math.floor((e.y + e.h - 1) / TILE)];
        for (const r of new Set(rows)) {
          if (this.tileAt(col, r) === STONE) this.breakStone(col, r);
        }
      }
      return;
    }

    const speed = e.kind === 'ogre' ? 0.38 : 0.5;
    const col = this.moveX(e, e.dir * speed);
    if (col === null) return;

    const rows = [Math.floor(e.y / TILE), Math.floor((e.y + e.h - 1) / TILE)];
    const isStone = rows.some((r) => this.tileAt(col, r) === STONE);
    const isWall = rows.some((r) => this.tileAt(col, r) === WALL);
    if (e.kind === 'ogre' && isStone && !isWall) {
      e.timer = 45;
    } else {
      e.dir = e.dir > 0 ? -1 : 1;
    }
  }

  private updateWisp(e: Enemy): void {
    const col = this.moveX(e, e.dir * 0.65);
    if (col === null) return;
    const rows = new Set([Math.floor(e.y / TILE), Math.floor((e.y + e.h - 1) / TILE)]);
    for (const r of rows) {
      if (this.tileAt(col, r) === STONE) this.breakStone(col, r);
    }
    e.dir = e.dir > 0 ? -1 : 1;
  }

  /** 스파크는 오른쪽 벽을 짚고 걷는 규칙으로 블록 표면을 따라 돈다 */
  private updateSpark(e: Enemy): void {
    const nx = e.cx + e.dx;
    const ny = e.cy + e.dy;
    // 가는 길에 블록이 생기면 그 자리에서 다시 길을 찾는다
    if (this.isSolid(nx, ny)) {
      e.progress = 0;
      this.chooseSparkDir(e);
      this.placeSpark(e);
      return;
    }
    e.progress += 1 / 18;
    if (e.progress >= 1) {
      e.cx = nx;
      e.cy = ny;
      e.progress = 0;
      this.chooseSparkDir(e);
    }
    this.placeSpark(e);
  }

  private chooseSparkDir(e: Enemy): void {
    const { cx, cy, dx, dy } = e;
    const right = { dx: -dy, dy: dx };
    const left = { dx: dy, dy: -dx };
    const free = (d: { dx: number; dy: number }) => !this.isSolid(cx + d.dx, cy + d.dy);

    // 짚고 있던 벽이 끝나면 모서리를 돌아 계속 짚는다
    if (free(right) && this.isSolid(cx - dx + right.dx, cy - dy + right.dy)) {
      e.dx = right.dx;
      e.dy = right.dy;
    } else if (free({ dx, dy })) {
      // 그대로 직진
    } else if (free(left)) {
      e.dx = left.dx;
      e.dy = left.dy;
    } else if (free(right)) {
      e.dx = right.dx;
      e.dy = right.dy;
    } else if (free({ dx: -dx, dy: -dy })) {
      e.dx = -dx;
      e.dy = -dy;
    } else {
      // 사방이 막혔다. 블록이 열릴 때까지 기다린다.
      e.dx = 0;
      e.dy = 0;
    }
  }

  private placeSpark(e: Enemy): void {
    const px = (e.cx + e.dx * e.progress) * TILE + 8;
    const py = (e.cy + e.dy * e.progress) * TILE + 8;
    e.x = px - e.w / 2;
    e.y = py - e.h / 2;
  }

  private updateTurret(e: Enemy): void {
    e.timer--;
    if (e.timer > 0) return;
    e.timer = TURRET_INTERVAL;
    const sx = e.dir > 0 ? e.x + e.w : e.x - 6;
    if (this.boxHitsSolid(sx, e.y + 5, 6, 6)) return;
    this.shots.push({ x: sx, y: e.y + 5, w: 6, h: 6, vx: ENEMY_SHOT_SPEED * e.dir, isFromPlayer: false });
    this.emit('shoot');
  }

  private updateMirrors(): void {
    for (const m of this.mirrors) {
      m.timer--;
      if (m.timer > 0) continue;
      m.timer = MIRROR_INTERVAL;
      const alive = this.enemies.filter((e) => e.isAlive && e.isSpawned).length;
      if (alive >= MIRROR_MAX_ALIVE) continue;
      const cell: Box = { x: m.tx * TILE, y: m.ty * TILE, w: TILE, h: TILE };
      if (overlaps(this.player, cell)) continue;
      const dir: 1 | -1 = this.player.x < cell.x ? -1 : 1;
      if (m.kind === 'goblin') this.addWalker('goblin', m.tx, m.ty, dir, true);
      else this.addWisp(m.tx, m.ty, dir, true);
      this.sparkle(cell.x + 8, cell.y + 8);
      this.emit('spawn');
    }
  }

  private updateShots(): void {
    for (const s of this.shots) {
      s.x += s.vx;
      if (this.boxHitsSolid(s.x, s.y, s.w, s.h)) {
        s.vx = 0;
        this.burst(s.x + s.w / 2, s.y + s.h / 2, s.isFromPlayer ? '#ffb347' : '#ff5e5e', 5);
        continue;
      }
      if (s.isFromPlayer) {
        const target = this.enemies.find((e) => e.isAlive && overlaps(e, s));
        if (target) {
          this.killEnemy(target);
          s.vx = 0;
        }
      }
    }
    this.shots = this.shots.filter((s) => s.vx !== 0);
  }

  private killEnemy(e: Enemy): void {
    e.isAlive = false;
    this.session.score += e.kind === 'ogre' || e.kind === 'turret' ? 500 : 300;
    this.burst(e.x + e.w / 2, e.y + e.h / 2, '#ffd166', 14);
    this.emit('kill');
  }

  // ---------------------------------------------------------------- 아이템

  private checkPickups(): void {
    const p = this.player;
    const body = shrink(p, 1);
    for (let n = this.items.length - 1; n >= 0; n--) {
      const it = this.items[n];
      const cell: Box = { x: it.tx * TILE + 2, y: it.ty * TILE + 2, w: 12, h: 12 };
      if (!overlaps(body, cell)) continue;
      this.items.splice(n, 1);
      this.collect(it);
    }

    for (let n = this.fairies.length - 1; n >= 0; n--) {
      if (!overlaps(body, this.fairies[n])) continue;
      this.fairies.splice(n, 1);
      this.session.lives = Math.min(MAX_LIVES, this.session.lives + 1);
      this.sparkle(p.x + 6, p.y + 6);
      this.emit('fairy');
    }
  }

  private collect(it: Item): void {
    const s = this.session;
    s.score += ITEM_SCORE[it.kind];
    const cx = it.tx * TILE + 8;
    const cy = it.ty * TILE + 8;
    this.sparkle(cx, cy);
    switch (it.kind) {
      case 'key':
        this.hasKey = true;
        this.door.isOpen = true;
        this.emit('key');
        break;
      case 'jar':
        s.fire = Math.min(MAX_FIRE, s.fire + 1);
        this.emit('jar');
        break;
      case 'hourglass':
        this.timeLeft += 20 * 60;
        this.emit('hourglass');
        break;
      case 'bell':
        this.fairies.push({ x: cx - 5, y: cy - 5, w: 10, h: 10, age: 0, baseX: cx - 5 });
        this.emit('bell');
        break;
      case 'rune':
        this.hasRune = true;
        this.emit('rune');
        break;
      default:
        this.emit('gem');
    }
  }

  private updateFairies(): void {
    for (const f of this.fairies) {
      f.age++;
      f.y -= 0.28;
      f.x = f.baseX + Math.sin(f.age / 22) * 14;
    }
    this.fairies = this.fairies.filter((f) => f.age < FAIRY_LIFE && f.y > -TILE);
  }

  // ---------------------------------------------------------------- 판정

  private checkDanger(): void {
    if (this.state !== 'play') return;
    const body = shrink(this.player, 2);
    for (const e of this.enemies) {
      if (e.isAlive && overlaps(body, shrink(e, 2))) {
        this.kill();
        return;
      }
    }
    for (const s of this.shots) {
      if (!s.isFromPlayer && overlaps(body, s)) {
        this.kill();
        return;
      }
    }
  }

  private checkDoor(): void {
    if (!this.door.isOpen || this.state !== 'play') return;
    const p = this.player;
    const cx = p.x + p.w / 2;
    const door: Box = { x: this.door.tx * TILE + 3, y: this.door.ty * TILE + 2, w: 10, h: 14 };
    if (cx > door.x && cx < door.x + door.w && overlaps(p, door)) {
      this.state = 'clear';
      this.stateTimer = 30;
      this.emit('door');
      this.emit('clear');
    }
  }

  /** 멀린이 쓰러진다. 남은 처리는 화면 쪽에서 목숨을 세며 한다. */
  kill(): void {
    if (this.state !== 'play') return;
    this.state = 'dying';
    this.stateTimer = DYING_FRAMES;
    const p = this.player;
    this.burst(p.x + p.w / 2, p.y + p.h / 2, '#8fb8ff', 18);
    this.emit('die');
  }

  get isDyingDone(): boolean {
    return this.state === 'dying' && this.stateTimer <= 0;
  }

  get isClearDone(): boolean {
    return this.state === 'clear' && this.stateTimer <= 0;
  }

  // ---------------------------------------------------------------- 효과

  private burst(x: number, y: number, color: string, count: number): void {
    for (let n = 0; n < count; n++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 1.6;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1,
        life: 30,
        maxLife: 30,
        color,
        hasGravity: true,
      });
    }
  }

  private sparkle(x: number, y: number): void {
    for (let n = 0; n < 8; n++) {
      const a = (n / 8) * Math.PI * 2;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * 1.1,
        vy: Math.sin(a) * 1.1,
        life: 22,
        maxLife: 22,
        color: n % 2 ? '#fff3a3' : '#b9a6ff',
        hasGravity: false,
      });
    }
  }

  private updateParticles(): void {
    for (const pt of this.particles) {
      pt.x += pt.vx;
      pt.y += pt.vy;
      if (pt.hasGravity) pt.vy += 0.12;
      pt.life--;
    }
    if (this.particles.length) this.particles = this.particles.filter((pt) => pt.life > 0);
  }
}
