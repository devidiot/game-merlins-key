/**
 * 터치와 키보드 입력을 한 프레임 단위 입력(InputFrame)으로 모은다.
 *
 * 이동은 "떠다니는 조이스틱"이다. 화면 왼쪽 절반 어디든 누르면 그 자리가 중심이
 * 되고, 거기서 좌우로 밀면 이동, 아래로 밀면 웅크린다. 아래 대각선이면 웅크린 채
 * 방향만 바꾼다(마법 조준). 손가락이 반지름 밖으로 나가면 중심이 따라와서, 반대로
 * 바꿀 때 조금만 되돌려도 된다. 왼쪽 아래 방향키 그림은 누르는 방향을 보여 주는
 * 표시일 뿐 꼭 거기를 누를 필요는 없다.
 *
 * 오른쪽 점프·마법·불꽃 버튼은 각자 따로 받는다.
 */
import type { InputFrame } from './game/world.ts';

type Action = 'jump' | 'magic' | 'fire';
type Dir = { left: boolean; right: boolean; down: boolean };

/** 이만큼(CSS px) 밀어야 움직이기 시작한다 */
const STICK_DEAD = 12;
/** 손가락이 이보다 멀어지면 중심이 따라온다 */
const STICK_RADIUS = 46;
/** 아래로 이만큼 밀면 웅크린다 */
const STICK_DOWN = 20;

const KEY_MAP: Record<string, 'left' | 'right' | 'down' | Action> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowUp: 'jump',
  KeyW: 'jump',
  KeyZ: 'jump',
  Space: 'jump',
  KeyX: 'magic',
  KeyJ: 'magic',
  KeyC: 'fire',
  KeyK: 'fire',
};

/** 글자를 입력하는 칸(input, textarea, 편집 가능한 요소)에서 일어난 키인지 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;
}

export class Controls {
  private keys = new Set<string>();
  /** 조이스틱을 잡은 손가락. 한 번에 하나만 받는다. */
  private stick: { id: number; ox: number; oy: number; dir: Dir } | null = null;
  private buttonPointers = new Map<number, Action>();
  private pressed = { jump: 0, magic: 0, fire: 0 };
  private pad: HTMLElement;
  private stickEl: HTMLElement;
  private knobEl: HTMLElement;
  /** 아무 입력이나 처음 들어오면 부른다 (오디오 잠금 해제용) */
  onFirstInput: (() => void) | null = null;
  onPause: (() => void) | null = null;

  /**
   * @param zone 조이스틱을 받을 영역 (게임 전체). 왼쪽 절반에서 시작한 터치만 쓴다.
   * @param pad 방향을 보여 주는 방향키 그림
   * @param stick 손가락 자리에 뜨는 고리 (안에 손잡이 요소가 하나 있다)
   */
  constructor(zone: HTMLElement, pad: HTMLElement, stick: HTMLElement, buttons: Record<Action, HTMLElement>) {
    this.pad = pad;
    this.stickEl = stick;
    this.knobEl = stick.firstElementChild as HTMLElement;
    this.bindStick(zone);
    for (const [action, el] of Object.entries(buttons) as [Action, HTMLElement][]) {
      this.bindButton(el, action);
    }
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.reset());
  }

  private touched(): void {
    this.onFirstInput?.();
  }

  private bindStick(zone: HTMLElement): void {
    zone.addEventListener('pointerdown', (e) => {
      if (this.stick || e.pointerType === 'mouse' && e.button !== 0) return;
      const target = e.target as HTMLElement;
      // 버튼, 메뉴 화면, 입력칸에서 시작한 터치는 조이스틱이 아니다
      if (target.closest('button, .overlay, input, textarea, #hud')) return;
      if (e.clientX > window.innerWidth / 2) return;
      e.preventDefault();
      this.touched();
      try {
        // 손가락이 버튼 위로 지나가도 조이스틱이 이 터치를 계속 받게 한다
        zone.setPointerCapture(e.pointerId);
      } catch {
        // 붙잡기를 못 해도 zone 안에서는 계속 받는다
      }
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dir: { left: false, right: false, down: false } };
      this.paintStick(e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', (e) => {
      const s = this.stick;
      if (!s || s.id !== e.pointerId) return;
      let dx = e.clientX - s.ox;
      let dy = e.clientY - s.oy;
      const dist = Math.hypot(dx, dy);
      if (dist > STICK_RADIUS) {
        // 중심을 손가락 쪽으로 끌어와 반지름 안에 둔다
        s.ox = e.clientX - (dx / dist) * STICK_RADIUS;
        s.oy = e.clientY - (dy / dist) * STICK_RADIUS;
        dx = e.clientX - s.ox;
        dy = e.clientY - s.oy;
      }
      const isMoving = Math.hypot(dx, dy) > STICK_DEAD;
      const down = isMoving && dy > STICK_DOWN && dy > Math.abs(dx) * 0.6;
      // 웅크릴 때는 조금만 옆으로 밀어도 방향을 바꾼다 (조준)
      const side = down ? STICK_DEAD * 0.5 : STICK_DEAD;
      s.dir = { left: isMoving && dx < -side, right: isMoving && dx > side, down };
      this.paintStick(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (this.stick?.id !== e.pointerId) return;
      this.stick = null;
      this.paintStick(0, 0);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
  }

  private bindButton(el: HTMLElement, action: Action): void {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.touched();
      el.setPointerCapture(e.pointerId);
      this.buttonPointers.set(e.pointerId, action);
      this.pressed[action]++;
      el.classList.add('is-active');
    });
    const end = (e: PointerEvent) => {
      if (!this.buttonPointers.delete(e.pointerId)) return;
      if (![...this.buttonPointers.values()].includes(action)) el.classList.remove('is-active');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }

  /** 방향키 그림에 누르는 방향을 켜고, 손가락 자리에 고리와 손잡이를 띄운다 */
  private paintStick(x: number, y: number): void {
    const s = this.stick;
    const dir = this.padState();
    this.pad.classList.toggle('is-left', dir.left);
    this.pad.classList.toggle('is-right', dir.right);
    this.pad.classList.toggle('is-down', dir.down);
    this.stickEl.classList.toggle('hidden', !s);
    if (!s) return;
    this.stickEl.style.transform = `translate(${s.ox}px, ${s.oy}px)`;
    this.knobEl.style.transform = `translate(${x - s.ox}px, ${y - s.oy}px)`;
  }

  private padState(): Dir {
    return this.stick ? this.stick.dir : { left: false, right: false, down: false };
  }

  private onKey(e: KeyboardEvent, isDown: boolean): void {
    // 이름·백업 코드를 입력하는 중이면 키를 게임 조작으로 가로채지 않는다
    if (isTyping(e.target)) return;
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (isDown && !e.repeat) this.onPause?.();
      return;
    }
    const mapped = KEY_MAP[e.code];
    if (!mapped) return;
    e.preventDefault();
    this.touched();
    if (isDown) {
      if (!e.repeat && (mapped === 'jump' || mapped === 'magic' || mapped === 'fire')) this.pressed[mapped]++;
      this.keys.add(mapped);
    } else {
      this.keys.delete(mapped);
    }
  }

  /** 지금 상태를 읽고, 한 번 누름 신호는 비운다 */
  read(): InputFrame {
    const pad = this.padState();
    const frame: InputFrame = {
      left: pad.left || this.keys.has('left'),
      right: pad.right || this.keys.has('right'),
      down: pad.down || this.keys.has('down'),
      jumpPressed: this.pressed.jump > 0,
      magicPressed: this.pressed.magic > 0,
      firePressed: this.pressed.fire > 0,
    };
    this.pressed = { jump: 0, magic: 0, fire: 0 };
    return frame;
  }

  /** 화면이 바뀔 때 눌려 있던 입력이 남지 않게 비운다 */
  reset(): void {
    this.keys.clear();
    this.stick = null;
    this.buttonPointers.clear();
    this.pressed = { jump: 0, magic: 0, fire: 0 };
    this.paintStick(0, 0);
    document.querySelectorAll('.is-active').forEach((el) => el.classList.remove('is-active'));
  }
}
