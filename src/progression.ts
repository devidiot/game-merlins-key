/**
 * 룬 규칙. 화면을 모르는 순수 계산이라 Node 에서도 시험할 수 있다.
 *
 * - 일반 스테이지마다 룬이 하나씩 숨어 있다. 룬을 먹고 그 스테이지를 깨야 모은 것으로 친다.
 * - 한 장의 룬을 모두 모으면 그 장의 비밀 스테이지가 열린다.
 * - 룬 10개마다 게임을 시작할 때 목숨과 불꽃이 1씩 늘어난다.
 * - 비밀 스테이지 다섯 개를 모두 깨면 진짜 엔딩이다.
 */
import { CHAPTERS, SECRET_LEVELS } from './game/levels.ts';

export const RUNES_PER_BONUS = 10;
export const BASE_LIVES = 3;
export const MAX_LIVES = 9;
export const MAX_FIRE = 5;

/** 모은 룬 수에 따른 시작 보너스 */
export function runeBonus(runeCount: number): { lives: number; fire: number } {
  const step = Math.floor(runeCount / RUNES_PER_BONUS);
  return { lives: step, fire: step };
}

/** 새 게임을 시작할 때의 목숨과 불꽃 */
export function startingKit(runeCount: number): { lives: number; fire: number } {
  const bonus = runeBonus(runeCount);
  return {
    lives: Math.min(MAX_LIVES, BASE_LIVES + bonus.lives),
    fire: Math.min(MAX_FIRE, bonus.fire),
  };
}

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
