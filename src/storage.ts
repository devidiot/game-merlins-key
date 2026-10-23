/**
 * 진행 기록. 브라우저 localStorage 에 JSON 하나로 둔다.
 *
 * 사생활 보호 모드처럼 저장소를 못 쓰는 환경에서도 게임은 돌아가야 하므로
 * 읽기·쓰기 실패는 모두 조용히 넘긴다.
 */

const STORAGE_KEY = 'merlins-key:v1';
/** 저장 형식 버전. 2부터 unlocked 가 스테이지 수를 넘을 수 있다. */
const SCHEMA = 2;
/** 스테이지가 12개뿐이던 첫 판에서 마지막 스테이지 번호 (0부터) */
const FIRST_RELEASE_LAST_STAGE = 11;

export interface Progress {
  /**
   * 고를 수 있는 가장 높은 스테이지 번호 (0부터). 모든 스테이지를 깼으면
   * 스테이지 수와 같아진다. 스테이지가 늘어나면 그 번호가 곧 다음 스테이지다.
   */
  unlocked: number;
  best: number;
  /** 룬을 찾은 스테이지 번호들 */
  runes: number[];
  /** 깬 비밀 스테이지 번호들 (0부터) */
  secretsCleared: number[];
  lang: string | null;
  isSoundOn: boolean;
}

/** 배열은 기록마다 따로 가져야 하므로 매번 새로 만든다 */
const defaults = (): Progress => ({ unlocked: 0, best: 0, runes: [], secretsCleared: [], lang: null, isSoundOn: true });

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const data = JSON.parse(raw) as Partial<Progress> & { schema?: number };
    let unlocked = Number.isInteger(data.unlocked) ? Number(data.unlocked) : 0;
    // 첫 판은 마지막 스테이지를 깨도 unlocked 를 마지막 스테이지 번호에서 잘랐다.
    // 그래서 그 값으로 남은 기록은 "12스테이지까지 깼다"로 보고 다음으로 넘긴다.
    // 12스테이지에 도착만 하고 못 깬 기록도 함께 넘어가지만, 스테이지 고르기에서
    // 12를 다시 할 수 있으니 손해는 없다.
    if (data.schema === undefined && unlocked === FIRST_RELEASE_LAST_STAGE) unlocked++;
    const runes = Array.isArray(data.runes) ? data.runes.filter(Number.isInteger) : [];
    // 룬은 스테이지를 깼을 때만 저장된다. 룬을 찾은 스테이지는 깬 것이 확실하므로
    // 그 다음 스테이지는 반드시 열어 둔다.
    for (const n of runes) unlocked = Math.max(unlocked, n + 1);
    return {
      unlocked,
      best: Number.isFinite(data.best) ? Number(data.best) : 0,
      runes,
      secretsCleared: Array.isArray(data.secretsCleared) ? data.secretsCleared.filter(Number.isInteger) : [],
      lang: typeof data.lang === 'string' ? data.lang : null,
      isSoundOn: data.isSoundOn !== false,
    };
  } catch {
    return defaults();
  }
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...progress, schema: SCHEMA }));
  } catch {
    // 저장소를 쓸 수 없는 환경이면 이번 실행 동안만 기억한다
  }
}
