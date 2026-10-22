/**
 * 효과음. 음원 파일 없이 Web Audio 로 그때그때 만든다.
 *
 * iOS 는 사용자가 화면을 처음 건드린 순간에만 오디오를 열 수 있어서,
 * `unlock()` 을 첫 터치 때 부른다.
 */
import type { GameEvent } from './game/world.ts';

type Wave = OscillatorType;

let ctx: AudioContext | null = null;
let isEnabled = true;

export function unlockAudio(): void {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export function setSoundEnabled(value: boolean): void {
  isEnabled = value;
}

/** 주파수를 from 에서 to 로 미끄러뜨리는 짧은 소리 하나 */
function tone(from: number, to: number, duration: number, wave: Wave = 'square', volume = 0.08, delay = 0): void {
  if (!ctx || !isEnabled) return;
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function melody(notes: number[], step: number, wave: Wave = 'square', volume = 0.07): void {
  notes.forEach((f, n) => tone(f, f, step * 0.95, wave, volume, n * step));
}

const SOUNDS: Partial<Record<GameEvent, () => void>> = {
  jump: () => tone(300, 620, 0.12, 'square', 0.05),
  create: () => tone(520, 900, 0.1, 'triangle', 0.1),
  break: () => tone(240, 60, 0.16, 'sawtooth', 0.07),
  fizzle: () => tone(160, 120, 0.08, 'square', 0.04),
  bump: () => tone(140, 90, 0.07, 'square', 0.06),
  key: () => melody([784, 988, 1175, 1568], 0.07),
  gem: () => melody([1319, 1760], 0.06, 'triangle'),
  jar: () => melody([523, 784], 0.07, 'triangle'),
  hourglass: () => melody([659, 523, 659, 784], 0.06, 'triangle'),
  bell: () => melody([1568, 1319, 1568], 0.09, 'sine', 0.12),
  rune: () => melody([523, 659, 784, 1047, 1319], 0.07, 'triangle', 0.09),
  fairy: () => melody([1047, 1319, 1568, 2093], 0.07, 'sine', 0.1),
  fire: () => tone(700, 200, 0.18, 'sawtooth', 0.06),
  kill: () => tone(500, 80, 0.25, 'square', 0.07),
  shoot: () => tone(220, 160, 0.12, 'sawtooth', 0.04),
  spawn: () => tone(200, 400, 0.2, 'sine', 0.05),
  die: () => melody([523, 466, 392, 330, 262, 196], 0.1),
  clear: () => melody([523, 659, 784, 1047, 784, 1047], 0.09),
  hurry: () => tone(1200, 1200, 0.05, 'square', 0.04),
};

export function playEvent(e: GameEvent): void {
  SOUNDS[e]?.();
}

export function playGameOver(): void {
  melody([392, 370, 349, 330, 196], 0.18, 'triangle', 0.09);
}

export function playEnding(): void {
  melody([523, 659, 784, 1047, 988, 1047, 1319, 1568], 0.14, 'triangle', 0.09);
}
