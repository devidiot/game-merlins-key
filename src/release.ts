/**
 * 스테이지 공개 일정. 화면을 모르는 순수 계산이라 Node 에서도 시험할 수 있다.
 *
 * 스테이지는 묶음 단위로 열린다.
 * - 첫 묶음: 1~30, 처음부터 열려 있다.
 * - 둘째 묶음: 31~50, 30스테이지를 깨는 순간 바로 열린다.
 * - 그 뒤로는 20개씩 묶는다 (51~70, 71~90, …).
 *
 * 둘째 묶음부터 다음 묶음이 열리려면 두 조건을 모두 채워야 한다.
 * 1. 지금 열린 묶음을 끝까지 깼을 것
 * 2. 지금 묶음이 열린 지 3일이 지났을 것. 그 묶음의 룬을 모두 모았으면 1일.
 *    (1일이 지난 뒤에 룬을 다 모았다면 다 모은 순간)
 *
 * 쉬는 동안 묶음이 쌓이지 않는다. 한 달을 쉬어도 다음 묶음 하나만 "지금 묶음을
 * 다 깨면 바로 열리는" 상태로 기다린다.
 *
 * 시각은 모두 서버 시각(ms)이다. 기기 시계를 바꿔도 앞당겨지지 않는다 (clock.ts).
 */
import type { Profile } from './storage.ts';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const NORMAL_WAIT_MS = 3 * DAY_MS;
export const RUNE_WAIT_MS = 1 * DAY_MS;
/** 계획한 전체 스테이지 수. 아직 만들지 않은 묶음은 "준비 중"으로 보여 준다. */
export const PLANNED_STAGES = 200;
const FIRST_BATCH = 30;
const BATCH = 20;

export interface Batch {
  /** 묶음 첫 스테이지 번호 (0부터) */
  first: number;
  last: number;
}

export const BATCHES: Batch[] = (() => {
  const out: Batch[] = [{ first: 0, last: FIRST_BATCH - 1 }];
  for (let first = FIRST_BATCH; first < PLANNED_STAGES; first += BATCH) {
    out.push({ first, last: Math.min(first + BATCH, PLANNED_STAGES) - 1 });
  }
  return out;
})();

export const batchOf = (stage: number): number => BATCHES.findIndex((b) => stage >= b.first && stage <= b.last);

const isBatchCleared = (p: Profile, b: Batch): boolean => p.unlocked > b.last;

function allRunesAt(p: Profile, b: Batch): number | null {
  let latest = 0;
  for (let s = b.first; s <= b.last; s++) {
    const t = p.runeAt[s];
    if (!p.runes.includes(s) || t === undefined) return null;
    latest = Math.max(latest, t);
  }
  return latest;
}

export interface NextRelease {
  /** 다음에 열릴 묶음 번호 */
  batch: number;
  /** 지금 묶음을 다 깨면 열리는 가장 이른 시각. 첫 묶음 다음은 시간 조건이 없어서 null */
  earliestAt: number | null;
  /** 룬을 다 모아서 1일로 앞당겨졌는지 */
  hasRuneBonus: boolean;
  /** 룬을 다 모으면 열릴 시각 (아직 다 못 모았을 때 안내용) */
  runeBonusAt: number | null;
  /** 지금 묶음을 아직 다 못 깼는지 */
  needsClear: boolean;
}

/** 다음 묶음이 언제, 어떤 조건으로 열리는지. 모든 묶음이 열렸으면 null */
export function nextRelease(p: Profile): NextRelease | null {
  const k = p.openedAt.length - 1;
  if (k + 1 >= BATCHES.length) return null;
  const cur = BATCHES[k];
  const needsClear = !isBatchCleared(p, cur);
  if (k === 0) {
    return { batch: 1, earliestAt: null, hasRuneBonus: false, runeBonusAt: null, needsClear };
  }
  const opened = p.openedAt[k];
  const normal = opened + NORMAL_WAIT_MS;
  const runesAt = allRunesAt(p, cur);
  if (runesAt !== null) {
    const bonus = Math.max(opened + RUNE_WAIT_MS, runesAt);
    if (bonus < normal) return { batch: k + 1, earliestAt: bonus, hasRuneBonus: true, runeBonusAt: bonus, needsClear };
  }
  return { batch: k + 1, earliestAt: normal, hasRuneBonus: false, runeBonusAt: opened + RUNE_WAIT_MS, needsClear };
}

/**
 * 조건이 채워진 묶음을 연다. 연 묶음이 있으면 true.
 * 연 시각은 "지금"이 아니라 조건이 채워진 시각으로 적는다. 그래야 며칠 늦게
 * 들어와도 그다음 묶음의 시계가 밀리지 않는다.
 */
export function applyReleases(p: Profile, now: number | null): boolean {
  let isChanged = false;
  for (;;) {
    const next = nextRelease(p);
    if (!next || next.needsClear) break;
    const k = p.openedAt.length - 1;
    const clearedAt = p.clearedAt[BATCHES[k].last] ?? now ?? 0;
    if (next.earliestAt === null) {
      p.openedAt.push(clearedAt);
    } else {
      if (now === null || now < next.earliestAt) break;
      p.openedAt.push(Math.max(next.earliestAt, clearedAt));
    }
    isChanged = true;
  }
  return isChanged;
}

/** 지금 열려 있는 마지막 스테이지 번호 (0부터) */
export function lastOpenStage(p: Profile): number {
  return BATCHES[Math.min(p.openedAt.length, BATCHES.length) - 1].last;
}
