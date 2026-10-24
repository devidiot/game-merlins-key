/**
 * 저장 기록. 브라우저 localStorage 에 JSON 하나로 둔다.
 *
 * 이름(프로필)마다 진행 기록이 따로 있다. 로그인은 없고, 이름은 이 기기 안에만
 * 저장된다. 언어·소리 같은 설정은 프로필과 상관없이 기기에 하나다.
 *
 * 사생활 보호 모드처럼 저장소를 못 쓰는 환경에서도 게임은 돌아가야 하므로
 * 읽기·쓰기 실패는 모두 조용히 넘긴다.
 */

import { BASE_LIFE_CAP, MAX_LIVES } from './lives.ts';

const STORAGE_KEY = 'merlins-key:v2';
/** 이름 기능이 생기기 전의 기록. 처음 등록하는 이름이 이어받는다. */
const LEGACY_KEY = 'merlins-key:v1';
/** 스테이지가 12개뿐이던 첫 판에서 마지막 스테이지 번호 (0부터) */
const FIRST_RELEASE_LAST_STAGE = 11;

export interface Profile {
  name: string;
  createdAt: number;
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
  /** 스테이지를 처음 깬 시각 (스테이지 번호 → 서버 기준 ms) */
  clearedAt: Record<string, number>;
  /** 룬을 처음 기록한 시각 (스테이지 번호 → 서버 기준 ms) */
  runeAt: Record<string, number>;
  /** 공개 묶음이 열린 시각. openedAt[0] 은 처음 시작한 시각이다. release.ts 참고 */
  openedAt: number[];
  /** 남은 생명. 시간이 지나면 찬다 (lives.ts) */
  lives: number;
  /** 생명 충전 시계의 기준 시각 (서버 기준 ms) */
  livesAt: number;
  /**
   * 스테이지를 30초 넘게 하는 중인지. 그 상태로 앱을 닫으면 다음에 열 때
   * 생명 하나를 뺀다. 메뉴로 나갈 때와 같은 규칙을 앱을 꺼서 피하지 못하게 한다.
   */
  isMidStage: boolean;
}

export interface Settings {
  lang: string | null;
  isSoundOn: boolean;
  /** 마지막으로 확인한 서버 시각. 오프라인일 때 공개 일정 계산에 쓴다. */
  lastServerTime: number | null;
}

interface Store {
  profiles: Record<string, Profile>;
  currentName: string | null;
  settings: Settings;
}

const ints = (v: unknown): number[] => (Array.isArray(v) ? v.filter(Number.isInteger) : []);
const times = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') {
    for (const [k, t] of Object.entries(v)) if (Number.isFinite(t)) out[k] = Number(t);
  }
  return out;
};

export function newProfile(name: string, now: number): Profile {
  return {
    name,
    createdAt: now,
    unlocked: 0,
    best: 0,
    runes: [],
    secretsCleared: [],
    clearedAt: {},
    runeAt: {},
    openedAt: [now],
    lives: BASE_LIFE_CAP,
    livesAt: now,
    isMidStage: false,
  };
}

/** 저장된 값이나 백업 코드에서 읽은 값을 믿을 수 있는 형태로 다듬는다 */
export function sanitizeProfile(raw: unknown, fallbackNow: number): Profile | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<Profile>;
  if (typeof d.name !== 'string' || !d.name) return null;
  const createdAt = Number.isFinite(d.createdAt) ? Number(d.createdAt) : fallbackNow;
  const openedAt = Array.isArray(d.openedAt) ? d.openedAt.filter(Number.isFinite) : [];
  return {
    name: d.name,
    createdAt,
    unlocked: Number.isInteger(d.unlocked) ? Math.max(0, Number(d.unlocked)) : 0,
    best: Number.isFinite(d.best) ? Number(d.best) : 0,
    runes: ints(d.runes),
    secretsCleared: ints(d.secretsCleared),
    clearedAt: times(d.clearedAt),
    runeAt: times(d.runeAt),
    openedAt: openedAt.length ? openedAt : [createdAt],
    // 생명이 생기기 전 기록은 가득 찬 채로 시작한다
    lives: Number.isInteger(d.lives) ? Math.min(MAX_LIVES, Math.max(0, Number(d.lives))) : BASE_LIFE_CAP,
    livesAt: Number.isFinite(d.livesAt) ? Number(d.livesAt) : fallbackNow,
    isMidStage: d.isMidStage === true,
  };
}

const defaultSettings = (): Settings => ({ lang: null, isSoundOn: true, lastServerTime: null });

let store: Store = { profiles: {}, currentName: null, settings: defaultSettings() };
/** 이름 기능 전의 기록. 첫 이름을 등록할 때 넘겨주고 지운다. */
let legacy: Pick<Profile, 'unlocked' | 'best' | 'runes' | 'secretsCleared'> | null = null;

export function loadStore(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<Store>;
      const profiles: Record<string, Profile> = {};
      for (const p of Object.values(data.profiles ?? {})) {
        const clean = sanitizeProfile(p, Date.now());
        if (clean) profiles[clean.name] = clean;
      }
      const s = data.settings ?? defaultSettings();
      store = {
        profiles,
        currentName: typeof data.currentName === 'string' && profiles[data.currentName] ? data.currentName : null,
        settings: {
          lang: typeof s.lang === 'string' ? s.lang : null,
          isSoundOn: s.isSoundOn !== false,
          lastServerTime: Number.isFinite(s.lastServerTime) ? Number(s.lastServerTime) : null,
        },
      };
    }
  } catch {
    // 망가진 기록은 버리고 새로 시작한다
  }
  loadLegacy();
}

/** 이름 기능 전 기록을 읽어 둔다. 설정은 바로 옮기고, 진행은 첫 이름에 넘긴다. */
function loadLegacy(): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const d = JSON.parse(raw) as Record<string, unknown> & { schema?: number };
    if (typeof d.lang === 'string' && !store.settings.lang) store.settings.lang = d.lang;
    if (d.isSoundOn === false) store.settings.isSoundOn = false;
    let unlocked = Number.isInteger(d.unlocked) ? Number(d.unlocked) : 0;
    // 첫 판은 마지막 스테이지를 깨도 unlocked 를 마지막 스테이지 번호에서 잘랐다.
    if (d.schema === undefined && unlocked === FIRST_RELEASE_LAST_STAGE) unlocked++;
    const runes = ints(d.runes);
    // 룬은 스테이지를 깼을 때만 저장된다. 룬을 찾은 스테이지는 깬 것이 확실하다.
    for (const n of runes) unlocked = Math.max(unlocked, n + 1);
    if (unlocked > 0 || runes.length) {
      legacy = {
        unlocked,
        best: Number.isFinite(d.best) ? Number(d.best) : 0,
        runes,
        secretsCleared: ints(d.secretsCleared),
      };
    }
  } catch {
    legacy = null;
  }
}

export function saveStore(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // 저장소를 쓸 수 없는 환경이면 이번 실행 동안만 기억한다
  }
}

export const settings = (): Settings => store.settings;
export const profileNames = (): string[] =>
  Object.values(store.profiles)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((p) => p.name);
export const currentProfile = (): Profile | null =>
  store.currentName ? store.profiles[store.currentName] ?? null : null;

/** 이름으로 고른다. 없는 이름이면 새로 만든다. 이름 기능 전 기록은 첫 이름이 이어받는다. */
export function selectProfile(name: string, now: number): Profile {
  let p = store.profiles[name];
  if (!p) {
    p = newProfile(name, now);
    if (legacy) {
      Object.assign(p, legacy);
      // 예전 기록에는 시각이 없으니 지금 깬 것으로 친다
      for (let n = 0; n < legacy.unlocked; n++) p.clearedAt[n] = now;
      for (const n of legacy.runes) p.runeAt[n] = now;
      legacy = null;
      try {
        localStorage.removeItem(LEGACY_KEY);
      } catch {
        // 지우지 못해도 다음에 다시 넘겨주지 않도록 메모리에서는 비웠다
      }
    }
    store.profiles[name] = p;
  }
  store.currentName = name;
  saveStore();
  return p;
}

/** 백업 코드에서 읽은 프로필을 넣는다. 같은 이름이 있으면 덮어쓴다. */
export function putProfile(p: Profile): void {
  store.profiles[p.name] = p;
  store.currentName = p.name;
  saveStore();
}

export function deleteProfile(name: string): void {
  delete store.profiles[name];
  if (store.currentName === name) store.currentName = null;
  saveStore();
}

export const hasLegacyProgress = (): boolean => legacy !== null;
