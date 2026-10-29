/**
 * 생명 규칙. 화면을 모르는 순수 계산이라 Node 에서도 시험할 수 있다.
 *
 * - 생명은 프로필에 저장되며 게임을 껐다 켜도 이어진다.
 * - 5개보다 적으면 2시간마다 1개씩 찬다. 5개에 닿으면 더 차지 않는다.
 * - 요정과 룬 보너스로는 5개를 넘어서도 늘어난다 (MAX_LIVES 까지).
 *   5개를 넘은 동안에는 시간이 흘러도 늘지 않는다.
 * - 충전 시계는 상한 아래로 떨어진 순간부터 돈다. 그래서 생명을 쓰기 전에는
 *   반드시 refillLives 로 시계를 맞춘다 (spendLife 가 대신 해 준다).
 *
 * 시각은 서버 기준 시각(ms)을 쓴다. 기기 시계를 앞으로 돌려도 빨리 차지 않는다 (clock.ts).
 */
import type { Profile } from './storage.ts';

/** 시간이 지나면 채워지는 생명의 기본 상한 */
export const BASE_LIFE_CAP = 5;
/** 생명 1개가 차는 데 걸리는 시간 */
export const LIFE_REFILL_MS = 2 * 60 * 60 * 1000;
/** 요정으로 늘릴 수 있는 최대 생명 */
export const MAX_LIVES = 20;

/** 흐른 시간만큼 생명을 채운다. 하나라도 찼으면 true */
export function refillLives(p: Profile, cap: number, now: number): boolean {
  if (p.lives >= cap) {
    p.livesAt = now;
    return false;
  }
  // 시계가 미래로 잡혀 있으면(기기 시각을 되돌린 경우) 지금부터 다시 센다
  if (p.livesAt > now) p.livesAt = now;
  const steps = Math.floor((now - p.livesAt) / LIFE_REFILL_MS);
  if (steps <= 0) return false;
  p.lives = Math.min(cap, p.lives + steps);
  p.livesAt = p.lives >= cap ? now : p.livesAt + steps * LIFE_REFILL_MS;
  return true;
}

/** 생명 하나를 쓴다. 상한에서 떨어지는 순간부터 충전 시계가 돈다. */
export function spendLife(p: Profile, cap: number, now: number): void {
  refillLives(p, cap, now);
  p.lives = Math.max(0, p.lives - 1);
}

/** 요정·룬 보너스로 생명을 얻는다. 상한은 넘을 수 있지만 MAX_LIVES 는 못 넘는다. */
export function gainLife(p: Profile, cap: number, now: number, count = 1): void {
  refillLives(p, cap, now);
  p.lives = Math.min(MAX_LIVES, p.lives + count);
  if (p.lives >= cap) p.livesAt = now;
}

/** 다음 생명이 차는 시각. 상한 이상이면 null */
export function nextLifeAt(p: Profile, cap: number): number | null {
  return p.lives < cap ? p.livesAt + LIFE_REFILL_MS : null;
}
