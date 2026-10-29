/**
 * 룬 규칙. 화면을 모르는 순수 계산이라 Node 에서도 시험할 수 있다.
 *
 * - 일반 스테이지마다 룬이 하나씩 숨어 있다. 룬을 먹고 그 스테이지를 깨야 모은 것으로 친다.
 * - 한 장의 룬을 모두 모으면 그 장의 비밀 스테이지가 열린다.
 * - 처음 깨는 스테이지에서 얻은 룬 10개마다 생명 2개를 한 번 받고, 시작 불꽃이 2씩 늘어난다.
 *   이미 깬 스테이지에 다시 들어가 얻은 룬은 비밀 스테이지와 공개 일정에만 센다.
 * - 비밀 스테이지 다섯 개를 모두 깨면 진짜 엔딩이다.
 */
import { CHAPTERS, SECRET_LEVELS } from './game/levels.ts';
import type { Profile } from './storage.ts';

export const RUNES_PER_BONUS = 10;
/** 룬 보너스 한 번에 받는 생명과 시작 불꽃 */
export const LIVES_PER_BONUS = 2;
export const FIRE_PER_BONUS = 2;
export const MAX_FIRE = 5;

/**
 * 보너스에 치는 룬 수. 스테이지를 처음 깰 때 함께 얻은 룬만 센다.
 * 그때는 깬 시각과 룬 시각을 같은 값으로 적으므로 두 시각이 같으면 첫 클리어 룬이다.
 */
export const bonusRuneCount = (p: Pick<Profile, 'runes' | 'runeAt' | 'clearedAt'>): number =>
  p.runes.filter((s) => p.runeAt[s] !== undefined && p.runeAt[s] === p.clearedAt[s]).length;

/** 룬 보너스 단계 (보너스 룬 10개마다 1) */
export const runeBonusSteps = (bonusRunes: number): number => Math.floor(bonusRunes / RUNES_PER_BONUS);

/** 게임을 시작할 때 드는 불꽃 */
export const startingFire = (bonusRunes: number): number =>
  Math.min(MAX_FIRE, runeBonusSteps(bonusRunes) * FIRE_PER_BONUS);

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
