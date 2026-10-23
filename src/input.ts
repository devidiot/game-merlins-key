/**
 * 터치 패드와 키보드 입력을 한 프레임 단위 입력(InputFrame)으로 모은다.
 *
 * 방향 패드는 버튼 세 개가 아니라 한 영역으로 받는다. 엄지를 떼지 않고
 * 왼쪽에서 오른쪽, 아래로 미끄러뜨려도 방향이 바로 바뀌어야 하기 때문이다.
 * 아래와 좌우를 함께 누르면 웅크린 채 방향만 바꾼다.
 */
import type { InputFrame } from './game/world.ts';

type Action = 'jump' | 'magic' | 'fire';

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
  private padPointers = new Map<number, { left: boolean; right: boolean; down: boolean }>();
  private buttonPointers = new Map<number, Action>();
  private pressed = { jump: 0, magic: 0, fire: 0 };
  private pad: HTMLElement;
  /** 아무 입력이나 처음 들어오면 부른다 (오디오 잠금 해제용) */
  onFirstInput: (() => void) | null = null;
  onPause: (() => void) | null = null;

  constructor(pad: HTMLElement, buttons: Record<Action, HTMLElement>) {
    this.pad = pad;
    this.bindPad();
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

  private bindPad(): void {
    const update = (e: PointerEvent) => {
      const r = this.pad.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      this.padPointers.set(e.pointerId, { left: nx < -0.28, right: nx > 0.28, down: ny > 0.3 });
      this.paintPad();
    };
    this.pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.touched();
      this.pad.setPointerCapture(e.pointerId);
      update(e);
    });
    this.pad.addEventListener('pointermove', (e) => {
      if (this.padPointers.has(e.pointerId)) update(e);
    });
    const end = (e: PointerEvent) => {
      this.padPointers.delete(e.pointerId);
      this.paintPad();
    };
    this.pad.addEventListener('pointerup', end);
    this.pad.addEventListener('pointercancel', end);
    this.pad.addEventListener('lostpointercapture', end);
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

  private paintPad(): void {
    const s = this.padState();
    this.pad.classList.toggle('is-left', s.left);
    this.pad.classList.toggle('is-right', s.right);
    this.pad.classList.toggle('is-down', s.down);
  }

  private padState(): { left: boolean; right: boolean; down: boolean } {
    const out = { left: false, right: false, down: false };
    for (const p of this.padPointers.values()) {
      out.left ||= p.left;
      out.right ||= p.right;
      out.down ||= p.down;
    }
    return out;
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
    this.padPointers.clear();
    this.buttonPointers.clear();
    this.pressed = { jump: 0, magic: 0, fire: 0 };
    this.paintPad();
    document.querySelectorAll('.is-active').forEach((el) => el.classList.remove('is-active'));
  }
}
