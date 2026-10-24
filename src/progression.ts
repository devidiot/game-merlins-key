/**
 * 룬 규칙. 화면을 모르는 순수 계산이라 Node 에서도 시험할 수 있다.
 *
 * - 일반 스테이지마다 룬이 하나씩 숨어 있다. 룬을 먹고 그 스테이지를 깨야 모은 것으로 친다.
 * - 한 장의 룬을 모두 모으면 그 장의 비밀 스테이지가 열린다.
 * - 룬 10개마다 생명 상한과 시작 불꽃이 1씩 늘어난다.
 * - 비밀 스테이지 다섯 개를 모두 깨면 진짜 엔딩이다.
 */
import { CHAPTERS, SECRET_LEVELS } from './game/levels.ts';
import { BASE_LIFE_CAP } from './lives.ts';

export const RUNES_PER_BONUS = 10;
export const MAX_FIRE = 5;

/** 모은 룬 수에 따른 보너스. lives 는 생명 상한에, fire 는 시작 불꽃에 더한다. */
export function runeBonus(runeCount: number): { lives: number; fire: number } {
  const step = Math.floor(runeCount / RUNES_PER_BONUS);
  return { lives: step, fire: step };
}

/** 시간이 지나면 채워지는 생명의 상한 */
export const lifeCap = (runeCount: number): number => BASE_LIFE_CAP + runeBonus(runeCount).lives;

/** 게임을 시작할 때 드는 불꽃 */
export const startingFire = (runeCount: number): number => Math.min(MAX_FIRE, runeBonus(runeCount).fire);

/** 장 하나에서 모은 룬 수와 전체 룬 수 */
export function chapterRunes(chapter: number, runes: readonly number[]): { got: number; total: number } {
  const { first, last } = CHAPTERS[chapter];
  const got = runes.filter((n) => n >= first && n <= last).length;
  return { got, total: last - first + 1 };
}

export function isSecretUnlocked(chapter: number, runes: readonly number[]): boolean {
  const { got, total } = chapterRunes(chapter, runes);
  return got >= total;
}

/** 스테이지 번호(0부터)가 속한 장 */
export function chapterOf(stage: number): number {
  return CHAPTERS.findIndex((c) => stage >= c.first && stage <= c.last);
}

export function isTrueEnding(secretsCleared: readonly number[]): boolean {
  return SECRET_LEVELS.every((_, i) => secretsCleared.includes(i));
}
