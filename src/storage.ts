/**
 * 진행 기록. 브라우저 localStorage 에 JSON 하나로 둔다.
 *
 * 사생활 보호 모드처럼 저장소를 못 쓰는 환경에서도 게임은 돌아가야 하므로
 * 읽기·쓰기 실패는 모두 조용히 넘긴다.
 */

const STORAGE_KEY = 'merlins-key:v1';

export interface Progress {
  /** 고를 수 있는 가장 높은 스테이지 번호 (0부터) */
  unlocked: number;
  best: number;
  /** 룬을 찾은 스테이지 번호들 */
  runes: number[];
  lang: string | null;
  isSoundOn: boolean;
}

const DEFAULTS: Progress = { unlocked: 0, best: 0, runes: [], lang: null, isSoundOn: true };

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const data = JSON.parse(raw) as Partial<Progress>;
    return {
      unlocked: Number.isInteger(data.unlocked) ? Number(data.unlocked) : 0,
      best: Number.isFinite(data.best) ? Number(data.best) : 0,
      runes: Array.isArray(data.runes) ? data.runes.filter(Number.isInteger) : [],
      lang: typeof data.lang === 'string' ? data.lang : null,
      isSoundOn: data.isSoundOn !== false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // 저장소를 쓸 수 없는 환경이면 이번 실행 동안만 기억한다
  }
}
