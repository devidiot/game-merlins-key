/**
 * World 상태를 캔버스에 그린다.
 *
 * 논리 해상도는 272 × 224 px(17 × 14 칸)이다. 캔버스의 실제 픽셀 수는 화면
 * 크기에 맞춰 정수배로 키우고, 그 위에 논리 좌표로 그린다. 그래야 도트가
 * 뭉개지지 않는다.
 */
import { sprite, type ArtName } from './sprites.ts';
import {
  GRID_H,
  GRID_W,
  STONE,
  TILE,
  VIEW_H,
  VIEW_W,
  WALL,
  type Enemy,
  type Item,
  type World,
} from '../game/world.ts';

function makeTile(draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TILE;
  c.height = TILE;
  draw(c.getContext('2d')!);
  return c;
}

/** 단단한 벽: 어두운 청회색 석판에 리벳 */
const WALL_TILE = () =>
  makeTile((ctx) => {
    ctx.fillStyle = '#3a4466';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#56628f';
    ctx.fillRect(0, 0, 16, 2);
    ctx.fillRect(0, 0, 2, 16);
    ctx.fillStyle = '#232a44';
    ctx.fillRect(0, 14, 16, 2);
    ctx.fillRect(14, 0, 2, 16);
    ctx.fillStyle = '#7b88b8';
    for (const [x, y] of [
      [4, 4],
      [10, 4],
      [4, 10],
      [10, 10],
    ]) {
      ctx.fillRect(x, y, 2, 2);
    }
  });

/** 돌 블록: 주황빛 벽돌. isCracked 면 금이 간 모습 */
const STONE_TILE = (isCracked: boolean) =>
  makeTile((ctx) => {
    ctx.fillStyle = '#c8763a';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#eda866';
    ctx.fillRect(0, 0, 16, 1);
    ctx.fillRect(0, 0, 1, 16);
    ctx.fillStyle = '#7a3e1a';
    ctx.fillRect(0, 15, 16, 1);
    ctx.fillRect(15, 0, 1, 16);
    // 벽돌 줄눈
    ctx.fillStyle = '#9a5228';
    ctx.fillRect(1, 7, 14, 1);
    ctx.fillRect(7, 1, 1, 6);
    ctx.fillRect(4, 8, 1, 7);
    ctx.fillRect(11, 8, 1, 7);
    ctx.fillStyle = '#e09050';
    ctx.fillRect(2, 2, 3, 1);
    ctx.fillRect(9, 2, 3, 1);
    ctx.fillRect(6, 10, 3, 1);
    if (isCracked) {
      ctx.fillStyle = '#3b1a0a';
      for (const [x, y] of [
        [8, 2],
        [9, 3],
        [8, 4],
        [7, 5],
        [8, 6],
        [9, 8],
        [10, 9],
        [9, 10],
        [10, 11],
        [5, 11],
        [6, 12],
        [5, 13],
      ]) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });

const DOOR_TILE = (isOpen: boolean) =>
  makeTile((ctx) => {
    // 아치 문틀
    ctx.fillStyle = '#1a1030';
    ctx.fillRect(2, 3, 12, 13);
    ctx.fillRect(4, 1, 8, 2);
    ctx.fillStyle = '#c9a14a';
    ctx.fillRect(3, 4, 10, 12);
    ctx.fillRect(5, 2, 6, 2);
    if (isOpen) {
      ctx.fillStyle = '#0b0620';
      ctx.fillRect(5, 5, 6, 11);
      ctx.fillRect(6, 4, 4, 1);
      ctx.fillStyle = '#fff3a3';
      ctx.fillRect(7, 7, 2, 2);
    } else {
      ctx.fillStyle = '#7a4a1e';
      ctx.fillRect(5, 5, 6, 11);
      ctx.fillRect(6, 4, 4, 1);
      ctx.fillStyle = '#4e2c10';
      ctx.fillRect(7, 5, 1, 11);
      ctx.fillStyle = '#ffd43b';
      ctx.fillRect(9, 10, 1, 2);
    }
  });

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scale = 1;
  private wall = WALL_TILE();
  private stone = STONE_TILE(false);
  private stoneCracked = STONE_TILE(true);
  private doorClosed = DOOR_TILE(false);
  private doorOpen = DOOR_TILE(true);
  private backdrop: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.backdrop = this.makeBackdrop();
    this.resize(VIEW_W);
  }

  /** 화면에 보일 CSS 크기를 받아 캔버스 실제 픽셀 수를 정한다 */
  resize(cssWidth: number): void {
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.max(1, Math.min(8, Math.ceil((Math.max(cssWidth, 1) * dpr) / VIEW_W)));
    if (scale === this.scale && this.canvas.width === VIEW_W * scale) return;
    this.scale = scale;
    this.canvas.width = VIEW_W * scale;
    this.canvas.height = VIEW_H * scale;
  }

  private makeBackdrop(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = VIEW_W;
    c.height = VIEW_H;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#120c2c');
    grad.addColorStop(1, '#1d1240');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // 옅은 벽돌 무늬 배경
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    for (let y = 0; y < GRID_H * 2; y++) {
      const off = y % 2 ? 8 : 0;
      for (let x = -1; x < GRID_W; x++) {
        ctx.fillRect(x * 16 + off, y * 8, 15, 7);
      }
    }
    // 별
    ctx.fillStyle = 'rgba(255,243,163,0.35)';
    for (let n = 0; n < 40; n++) {
      const x = (n * 97) % VIEW_W;
      const y = (n * 53 + n * n) % VIEW_H;
      ctx.fillRect(x, y, 1, 1);
    }
    return c;
  }

  /** 타이틀 화면 뒤에 깔리는 장면: 벽돌 바닥 위에서 멀린이 숨 쉬듯 움직인다 */
  drawIdle(now: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.backdrop, 0, 0);
    for (let tx = 0; tx < GRID_W; tx++) ctx.drawImage(this.wall, tx * TILE, VIEW_H - TILE);
    for (const tx of [3, 4, 12, 13]) ctx.drawImage(this.stone, tx * TILE, VIEW_H - TILE * 3);
    const frame = Math.floor(now / 16);
    ctx.drawImage(this.doorOpen, 13 * TILE, VIEW_H - TILE * 4);
    ctx.drawImage(sprite('merlinStand'), 4 * TILE, VIEW_H - TILE * 4 - (frame % 60 < 30 ? 0 : 1));
    ctx.drawImage(sprite('key'), 8 * TILE, VIEW_H - TILE * 5 + Math.round(Math.sin(frame / 15) * 2));
  }

  draw(world: World): void {
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.backdrop, 0, 0);

    this.drawTiles(world);
    this.drawDoor(world);
    this.drawMirrors(world);
    for (const it of world.items) this.drawItem(it, world.frame);
    this.drawAim(world);
    for (const e of world.enemies) if (e.isAlive) this.drawEnemy(e, world);
    this.drawPlayer(world);
    this.drawShots(world);
    this.drawFairies(world);
    this.drawParticles(world);

    if (world.state === 'dying') {
      const t = 1 - world.stateTimer / 100;
      ctx.fillStyle = `rgba(10,4,30,${Math.min(0.55, t * 0.8)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  private drawTiles(world: World): void {
    const ctx = this.ctx;
    for (let ty = 0; ty < GRID_H; ty++) {
      for (let tx = 0; tx < GRID_W; tx++) {
        const i = ty * GRID_W + tx;
        const t = world.tiles[i];
        if (t === WALL) ctx.drawImage(this.wall, tx * TILE, ty * TILE);
        else if (t === STONE) {
          ctx.drawImage(world.hp[i] <= 1 ? this.stoneCracked : this.stone, tx * TILE, ty * TILE);
        }
      }
    }
  }

  private drawDoor(world: World): void {
    const { tx, ty, isOpen, openAnim } = world.door;
    const ctx = this.ctx;
    ctx.drawImage(isOpen ? this.doorOpen : this.doorClosed, tx * TILE, ty * TILE);
    if (isOpen) {
      // 열린 문에서 빛이 새어 나온다
      const pulse = 0.25 + 0.15 * Math.sin(world.frame / 8);
      ctx.fillStyle = `rgba(255,243,163,${pulse * openAnim})`;
      ctx.fillRect(tx * TILE + 4, ty * TILE + 3, 8, 13);
    }
  }

  private drawMirrors(world: World): void {
    const ctx = this.ctx;
    for (const m of world.mirrors) {
      const x = m.tx * TILE;
      const y = m.ty * TILE;
      ctx.fillStyle = '#1a1030';
      ctx.fillRect(x + 3, y + 1, 10, 14);
      ctx.fillStyle = '#c9a14a';
      ctx.fillRect(x + 4, y + 2, 8, 12);
      const shimmer = (Math.sin(world.frame / 10 + m.tx) + 1) / 2;
      const warn = m.timer < 60 ? (m.timer % 10 < 5 ? 1 : 0) : 0;
      ctx.fillStyle = warn ? '#ff8fd0' : `rgb(${120 + shimmer * 60},${150 + shimmer * 60},255)`;
      ctx.fillRect(x + 5, y + 3, 6, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(x + 6, y + 4, 1, 3);
    }
  }

  private drawItem(it: Item, frame: number): void {
    const ctx = this.ctx;
    const bob = Math.round(Math.sin(frame / 15 + it.tx) * 1.5) - (it.pop > 0 ? Math.round(it.pop / 4) : 0);
    const x = it.tx * TILE;
    const y = it.ty * TILE + bob;
    const art: Partial<Record<Item['kind'], ArtName>> = {
      key: 'key',
      jar: 'jar',
      hourglass: 'hourglass',
      bell: 'bell',
    };
    const name = art[it.kind];
    if (name) {
      if (it.kind === 'key') {
        ctx.fillStyle = `rgba(255,212,59,${0.18 + 0.1 * Math.sin(frame / 6)})`;
        ctx.fillRect(x + 1, y + 1, 14, 14);
      }
      ctx.drawImage(sprite(name), x, y);
      return;
    }
    if (it.kind === 'gem') {
      // 마름모 보석
      ctx.fillStyle = '#1a1030';
      ctx.fillRect(x + 7, y + 2, 2, 1);
      ctx.fillRect(x + 4, y + 4, 8, 1);
      ctx.fillStyle = '#45c8ff';
      for (let r = 0; r < 10; r++) {
        const half = r < 4 ? r + 1 : 9 - r;
        ctx.fillRect(x + 8 - half, y + 3 + r, half * 2, 1);
      }
      ctx.fillStyle = '#cdefff';
      ctx.fillRect(x + 6, y + 5, 2, 2);
      return;
    }
    // 룬: 보랏빛으로 빛나는 원판에 별
    const glow = 0.5 + 0.5 * Math.sin(frame / 7);
    ctx.fillStyle = `rgba(185,166,255,${0.25 + glow * 0.25})`;
    ctx.fillRect(x + 1, y + 1, 14, 14);
    ctx.fillStyle = '#1a1030';
    ctx.fillRect(x + 3, y + 2, 10, 12);
    ctx.fillRect(x + 2, y + 3, 12, 10);
    ctx.fillStyle = '#7b4ee0';
    ctx.fillRect(x + 4, y + 3, 8, 10);
    ctx.fillRect(x + 3, y + 4, 10, 8);
    ctx.fillStyle = '#fff3a3';
    ctx.fillRect(x + 7, y + 4, 2, 8);
    ctx.fillRect(x + 4, y + 7, 8, 2);
    ctx.fillRect(x + 5, y + 5, 1, 1);
    ctx.fillRect(x + 10, y + 5, 1, 1);
    ctx.fillRect(x + 5, y + 10, 1, 1);
    ctx.fillRect(x + 10, y + 10, 1, 1);
  }

  private drawAim(world: World): void {
    if (world.state !== 'play' || !world.aim.isValid) return;
    const ctx = this.ctx;
    const x = world.aim.tx * TILE;
    const y = world.aim.ty * TILE;
    const a = 0.25 + 0.15 * Math.sin(world.frame / 6);
    ctx.fillStyle = `rgba(185,166,255,${a})`;
    // 모서리 네 군데만 찍어서 칸을 가리지 않는다
    for (const [cx, cy] of [
      [0, 0],
      [12, 0],
      [0, 15],
      [12, 15],
    ]) {
      ctx.fillRect(x + cx, y + cy, 4, 1);
    }
    for (const [cx, cy] of [
      [0, 0],
      [15, 0],
      [0, 12],
      [15, 12],
    ]) {
      ctx.fillRect(x + cx, y + cy, 1, 4);
    }
  }

  private drawEnemy(e: Enemy, world: World): void {
    const ctx = this.ctx;
    const x = Math.round(e.x + e.w / 2 - 8);
    const isLeft = e.dir < 0;
    switch (e.kind) {
      case 'goblin': {
        const step = Math.floor(world.frame / 12) % 2 === 0;
        ctx.drawImage(sprite(step ? 'goblin' : 'goblinStep', isLeft), x, Math.round(e.y + e.h - 16));
        break;
      }
      case 'ogre': {
        const shake = e.timer > 0 ? (world.frame % 4 < 2 ? -1 : 1) : 0;
        ctx.drawImage(sprite('ogre', isLeft), x + shake, Math.round(e.y + e.h - 16));
        break;
      }
      case 'wisp': {
        const bob = Math.round(Math.sin(world.frame / 9 + e.x / 20) * 1.5);
        ctx.globalAlpha = 0.9;
        ctx.drawImage(sprite('wisp', isLeft), x, Math.round(e.y + e.h / 2 - 8) + bob);
        ctx.globalAlpha = 1;
        break;
      }
      case 'turret': {
        const isWarning = e.timer < 30 && e.timer % 6 < 3;
        ctx.drawImage(sprite('turret', isLeft), Math.round(e.x - 1), Math.round(e.y - 1));
        if (isWarning) {
          ctx.fillStyle = 'rgba(255,94,94,0.6)';
          ctx.fillRect(Math.round(e.x + (isLeft ? -1 : 10)), Math.round(e.y + 8), 5, 3);
        }
        break;
      }
      case 'spark': {
        const cx = e.x + e.w / 2;
        const cy = e.y + e.h / 2;
        const spin = world.frame / 4;
        ctx.fillStyle = 'rgba(120,220,255,0.35)';
        ctx.fillRect(Math.round(cx - 6), Math.round(cy - 6), 12, 12);
        ctx.fillStyle = '#7fe3ff';
        for (let n = 0; n < 4; n++) {
          const a = spin + (n * Math.PI) / 2;
          ctx.fillRect(Math.round(cx + Math.cos(a) * 5 - 1), Math.round(cy + Math.sin(a) * 5 - 1), 2, 2);
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(cx - 2), Math.round(cy - 2), 4, 4);
        break;
      }
    }
  }

  private drawPlayer(world: World): void {
    const ctx = this.ctx;
    const p = world.player;
    const isLeft = p.facing < 0;
    const x = Math.round(p.x + p.w / 2 - 8);
    let y = Math.round(p.y + p.h - 16);

    if (world.state === 'dying') {
      // 빙글 돌며 떠오르다 사라진다
      const t = 100 - world.stateTimer;
      if (t > 70 && t % 4 < 2) return;
      y -= Math.round(Math.min(t, 40) * 0.4);
      ctx.save();
      ctx.translate(x + 8, y + 8);
      ctx.rotate(t / 6);
      ctx.drawImage(sprite('merlinStand', isLeft), -8, -8);
      ctx.restore();
      return;
    }
    if (world.state === 'clear') {
      // 문 안으로 들어가며 작아진다
      const s = Math.max(0, world.stateTimer / 30);
      ctx.save();
      ctx.globalAlpha = s;
      ctx.drawImage(sprite('merlinStand', isLeft), x + 8 - 8 * s, y + 16 - 16 * s, 16 * s, 16 * s);
      ctx.restore();
      return;
    }

    let name: ArtName = 'merlinStand';
    if (p.isCrouching) name = 'merlinCrouch';
    else if (p.castPose > 0) name = 'merlinCast';
    else if (!p.onGround) name = 'merlinWalk';
    else if (p.vx !== 0 && Math.floor(p.walkTime / 8) % 2 === 1) name = 'merlinWalk';
    ctx.drawImage(sprite(name, isLeft), x, y);
  }

  private drawShots(world: World): void {
    const ctx = this.ctx;
    for (const s of world.shots) {
      const cx = Math.round(s.x + s.w / 2);
      const cy = Math.round(s.y + s.h / 2);
      if (s.isFromPlayer) {
        ctx.fillStyle = 'rgba(255,159,28,0.45)';
        ctx.fillRect(cx - 6 - Math.sign(s.vx) * 4, cy - 3, 8, 6);
        ctx.fillStyle = '#ff9f1c';
        ctx.fillRect(cx - 4, cy - 4, 8, 8);
        ctx.fillStyle = '#fff3a3';
        ctx.fillRect(cx - 2, cy - 2, 4, 4);
      } else {
        ctx.fillStyle = '#ff5e5e';
        ctx.fillRect(cx - 3, cy - 3, 6, 6);
        ctx.fillStyle = '#ffd0d0';
        ctx.fillRect(cx - 1, cy - 1, 2, 2);
      }
    }
  }

  private drawFairies(world: World): void {
    const ctx = this.ctx;
    for (const f of world.fairies) {
      const x = Math.round(f.x);
      const y = Math.round(f.y);
      const flap = Math.floor(world.frame / 5) % 2;
      // 사라지기 직전에는 깜빡인다
      if (f.age > 480 && f.age % 6 < 3) continue;
      ctx.fillStyle = 'rgba(255,170,220,0.35)';
      ctx.fillRect(x - 2, y - 2, 14, 14);
      ctx.fillStyle = '#d6f5ff';
      ctx.fillRect(x, y + (flap ? 1 : 3), 3, 4);
      ctx.fillRect(x + 7, y + (flap ? 1 : 3), 3, 4);
      ctx.fillStyle = '#ff8fd0';
      ctx.fillRect(x + 3, y + 2, 4, 7);
      ctx.fillStyle = '#ffcf9e';
      ctx.fillRect(x + 3, y, 4, 3);
    }
  }

  private drawParticles(world: World): void {
    const ctx = this.ctx;
    for (const pt of world.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x - 1), Math.round(pt.y - 1), 2, 2);
    }
    ctx.globalAlpha = 1;
  }
}
