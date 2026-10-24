/**
 * 화면 흐름과 게임 루프.
 *
 * 메인 메뉴 → 스테이지 소개 → 플레이 → (클리어 → 다음 스테이지 소개) … → 엔딩
 *                                 └ 생명이 남으면 같은 스테이지 소개, 없으면 게임 오버
 *
 * 생명은 프로필에 저장되고 시간이 지나면 찬다 (lives.ts). 스테이지를 시작하고
 * 30초 안에는 생명을 잃지 않고 나갈 수 있고, 그 뒤로 나가면 생명 하나를 잃는다.
 *
 * 비밀 스테이지는 스테이지 고르기에서 하나씩 한다. 깨면 결과 화면으로 가고,
 * 다섯 개를 모두 깨면 진짜 엔딩이다. 룬 규칙은 progression.ts 에 있다.
 *
 * 처음 실행하면 (휴대폰 브라우저라면 홈 화면 설치 안내 →) 이름 등록 → 메인 메뉴 순이다.
 * 스테이지는 묶음으로 공개되며 그 규칙은 release.ts 에 있다.
 *
 * 게임 로직은 60fps 고정 간격으로 돌리고, 그림은 화면 주사율대로 그린다.
 */
import './style.css';
import { playEnding, playEvent, playGameOver, setSoundEnabled, unlockAudio } from './audio.ts';
import { applyI18n, detectLang, getLang, LANG_NAMES, setLang, t, type Lang, type MessageKey } from './i18n.ts';
import { Controls } from './input.ts';
import { CHAPTERS, LEVELS, SECRET_LEVELS, type LevelDef } from './game/levels.ts';
import { blockZoom } from './no-zoom.ts';
import { VIEW_H, VIEW_W, World, type GameEvent, type Session } from './game/world.ts';
import { Renderer } from './render/renderer.ts';
import { sprite } from './render/sprites.ts';
import {
  chapterOf,
  chapterRunes,
  isSecretUnlocked,
  isTrueEnding,
  lifeCap,
  runeBonus,
  startingFire,
} from './progression.ts';
import { gainLife, nextLifeAt, refillLives, spendLife } from './lives.ts';
import {
  FLAME,
  FLAME_EMPTY,
  HEART,
  HEART_EMPTY,
  ICON_BACKUP,
  ICON_EDIT,
  ICON_GLOBE,
  ICON_GRID,
  ICON_HELP,
  ICON_HOME,
  ICON_PLAY,
  ICON_RESTART,
  ICON_SOUND_OFF,
  ICON_SOUND_ON,
  RUNE,
} from './icons.ts';
import { decodeBackup, encodeBackup } from './backup.ts';
import { seedServerTime, serverNow, syncServerTime } from './clock.ts';
import { canPromptInstall, isIOS, onInstallChange, promptInstall, shouldSuggestInstall } from './install.ts';
import { cleanName } from './names.ts';
import { applyReleases, BATCHES, DAY_MS, lastOpenStage, nextRelease } from './release.ts';
import {
  currentProfile,
  deleteProfile,
  hasLegacyProgress,
  loadStore,
  newProfile,
  profileNames,
  putProfile,
  saveStore,
  selectProfile,
  settings,
  type Profile,
} from './storage.ts';

type Screen = 'title' | 'intro' | 'play' | 'paused' | 'clear' | 'end';
/** 지금 하는 스테이지. 일반은 LEVELS, 비밀은 SECRET_LEVELS 의 번호(0부터)다. */
type StageRef = { isSecret: boolean; index: number };
type Ending = 'gameOver' | 'allClear' | 'secretClear' | 'trueEnding' | 'waiting';

const STEP_MS = 1000 / 60;
const INTRO_AUTO_MS = 2600;
const CLEAR_SHOW_MS = 2200;
const TIME_BONUS_PER_SECOND = 10;
/** 스테이지를 시작하고 이 시간(프레임) 안에는 생명을 잃지 않고 나갈 수 있다 */
const FREE_LEAVE_FRAMES = 30 * 60;
/** HUD 에서 하트·불꽃을 하나씩 그리는 최대 개수. 넘으면 "×N" 으로 줄인다. */
const MAX_STOCK_ICONS = 8;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 가 없습니다`);
  return el as T;
};

loadStore();
const prefs = settings();
setSoundEnabled(prefs.isSoundOn);
setLang(detectLang(prefs.lang));
seedServerTime(prefs.lastServerTime);
/** 지금 고른 이름의 기록. 이름을 고르기 전에는 빈 기록이다. */
let progress: Profile = currentProfile() ?? newProfile('', 0);

/** 기록에 적을 지금 시각. 서버 시각을 모르면 기기 시각으로 대신한다. */
const stampNow = (): number => serverNow() ?? Date.now();

const canvas = $<HTMLCanvasElement>('game');
const renderer = new Renderer(canvas);
const controls = new Controls($('app'), $('dpad'), $('stick'), {
  jump: $('btn-jump'),
  magic: $('btn-block'),
  fire: $('btn-fire'),
});
controls.onFirstInput = unlockAudio;
controls.onPause = () => {
  if (screen === 'play') pauseGame();
  else if (screen === 'paused') resumeGame();
};

let screen: Screen = 'title';
let session: Session = { score: 0, lives: 0, fire: 0 };
let current: StageRef = { isSecret: false, index: 0 };
let world: World | null = null;
let introTimer = 0;
let clearTimer = 0;
/** 이번 시도에서 실제로 플레이한 시간(프레임). 일시정지 중에는 늘지 않는다. */
let playFrames = 0;

// ---------------------------------------------------------------- 화면 전환

const OVERLAYS = [
  'install-screen',
  'name-screen',
  'backup-screen',
  'title-screen',
  'stages-screen',
  'howto-screen',
  'intro-screen',
  'pause-screen',
  'clear-screen',
  'end-screen',
];

function showOverlay(id: string | null): void {
  for (const name of OVERLAYS) $(name).classList.toggle('hidden', name !== id);
}

function goTitle(): void {
  screen = 'title';
  world = null;
  controls.reset();
  refreshTitle();
  showOverlay('title-screen');
}

/** 지금 할 수 있는 가장 뒤 스테이지 (공개 범위와 만든 스테이지 수 안에서) */
const playableLast = (): number => Math.min(lastOpenStage(progress), LEVELS.length - 1);

/** 생명 상한 (기본 5개에 룬 보너스를 더한다) */
const cap = (): number => lifeCap(progress.runes.length);

/** 흐른 시간만큼 생명을 채운다 */
function refreshLives(): void {
  if (progress.name && refillLives(progress, cap(), stampNow())) saveStore();
}

/** 남은 시간을 "2일 3시간 12분" 처럼 적는다. 1분보다 적게 남아도 1분으로 보여 준다. */
function formatLeft(ms: number): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const parts: string[] = [];
  if (d) parts.push(t('durDay', { n: d }));
  if (h) parts.push(t('durHour', { n: h }));
  if (m || parts.length === 0) parts.push(t('durMin', { n: m }));
  return parts.join(' ');
}

/** 하트·불꽃을 개수만큼 그린다. slots 까지는 빈 자리로 채운다. */
function paintStock(el: HTMLElement, count: number, slots: number, full: string, empty: string, label: string): void {
  el.innerHTML =
    Math.max(count, slots) > MAX_STOCK_ICONS
      ? `${full}<b>×${count}</b>`
      : full.repeat(count) + empty.repeat(Math.max(0, slots - count));
  el.setAttribute('aria-label', label);
}

const paintHearts = (el: HTMLElement, lives: number): void =>
  paintStock(el, lives, cap(), HEART, HEART_EMPTY, t('livesCount', { n: lives }));

function refreshTitle(): void {
  refreshLives();
  $('title-player').textContent = progress.name;
  const stats = [t('runesTotal', { got: progress.runes.length, total: runeTotal() })];
  if (progress.best > 0) stats.unshift(t('bestShort', { n: progress.best.toLocaleString() }));
  $('title-stats').textContent = stats.join(' · ');
  paintHearts($('title-hearts'), progress.lives);
  const nextLife = nextLifeAt(progress, cap());
  $('title-life-timer').textContent =
    nextLife === null ? t('livesFull') : t('lifeTimer', { time: formatLeft(nextLife - stampNow()) });
  const bonus = runeBonus(progress.runes.length);
  $('title-bonus').textContent = t('runeBonus', { n: bonus.lives });
  $('title-bonus').classList.toggle('hidden', bonus.lives === 0);
  $('title-browser-warning').classList.toggle('hidden', !shouldSuggestInstall());
  refreshPlayButton();
  const release = titleNotice ?? releaseLines();
  $('title-release').textContent = release.join('\n');
  $('title-release').classList.toggle('hidden', release.length === 0);
  refreshToggles();
}

/**
 * 메인 메뉴의 큰 버튼. 다음에 할 스테이지를 바로 시작한다.
 * 다음 스테이지가 아직 안 열렸거나 생명이 없으면 언제 할 수 있는지 보여 주고 막아 둔다.
 */
function refreshPlayButton(): void {
  const next = progress.unlocked;
  let main: string;
  let sub: string;
  let isBlocked = true;
  if (next > playableLast()) {
    main = t('nextStage', { n: next + 1 });
    sub = waitText();
  } else if (progress.lives <= 0) {
    main = t('outOfLives');
    sub = t('nextLifeIn', { time: formatLeft((nextLifeAt(progress, cap()) ?? 0) - stampNow()) });
  } else {
    main = t(next === 0 ? 'newGame' : 'continueGame');
    sub = t('playSub', { n: next + 1, name: t(`stage${next + 1}` as MessageKey) });
    isBlocked = false;
  }
  $('play-main').textContent = main;
  $('play-sub').textContent = sub;
  $<HTMLButtonElement>('btn-play').disabled = isBlocked;
}

/** 다음 스테이지가 열리기까지 남은 시간. 시간이 됐는데 아직 만들지 않았으면 "준비 중" */
function waitText(): string {
  // 공개는 됐는데 아직 만들지 않은 스테이지
  if (progress.unlocked <= lastOpenStage(progress)) return t('comingSoon');
  const info = nextRelease(progress);
  if (!info || info.earliestAt === null) return t('comingSoon');
  const left = info.earliestAt - stampNow();
  if (left > 0) return t('opensIn', { time: formatLeft(left) });
  return isBatchBuilt(info.batch) ? t('opensSoon') : t('comingSoon');
}

/** 소리·언어 아이콘 버튼을 지금 설정에 맞춘다 */
function refreshToggles(): void {
  document.querySelectorAll<HTMLButtonElement>('.sound-toggle').forEach((b) => {
    b.innerHTML = prefs.isSoundOn ? ICON_SOUND_ON : ICON_SOUND_OFF;
    b.classList.toggle('is-off', !prefs.isSoundOn);
    b.setAttribute('aria-label', t(prefs.isSoundOn ? 'soundOff' : 'soundOn'));
    b.title = b.getAttribute('aria-label') ?? '';
  });
  document.querySelectorAll<HTMLButtonElement>('.lang-toggle').forEach((b) => {
    b.innerHTML = `${ICON_GLOBE}<span class="lang-code">${getLang() === 'ko' ? '한' : 'EN'}</span>`;
    b.setAttribute('aria-label', t('languageSwitch', { lang: LANG_NAMES[getLang()] }));
    b.title = b.getAttribute('aria-label') ?? '';
  });
  document.querySelectorAll<HTMLButtonElement>('.lang-btn').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.lang === getLang()));
  });
}

const levelOf = (ref: StageRef): LevelDef => (ref.isSecret ? SECRET_LEVELS : LEVELS)[ref.index];
/** HUD·소개 화면에 쓰는 짧은 번호: 일반은 "13", 비밀은 "S2" */
const shortLabel = (ref: StageRef): string => (ref.isSecret ? `S${ref.index + 1}` : String(ref.index + 1));
const nameKey = (ref: StageRef): MessageKey =>
  (ref.isSecret ? `secret${ref.index + 1}` : `stage${ref.index + 1}`) as MessageKey;

function startGame(ref: StageRef): void {
  unlockAudio();
  refreshLives();
  if (progress.lives <= 0) {
    goTitle();
    return;
  }
  titleNotice = null;
  // 룬 10개마다 불꽃을 하나씩 더 들고 시작한다
  session = { score: 0, lives: progress.lives, fire: startingFire(progress.runes.length) };
  current = ref;
  showIntro();
}

function showIntro(): void {
  session.lives = progress.lives;
  world = new World(levelOf(current), session);
  screen = 'intro';
  playFrames = 0;
  controls.reset();
  $('intro-no').textContent = current.isSecret
    ? `${t('secret')} ${current.index + 1}`
    : `${t('stage')} ${current.index + 1}`;
  $('intro-name').textContent = t(nameKey(current));
  const hint = current.isSecret ? '' : t(`hint${current.index + 1}` as MessageKey);
  $('intro-hint').textContent = hint;
  $('intro-hint').classList.toggle('hidden', !hint);
  showOverlay('intro-screen');
  // 힌트가 있으면 읽을 시간을 조금 더 준다
  introTimer = window.setTimeout(beginPlay, hint ? INTRO_AUTO_MS + 1400 : INTRO_AUTO_MS);
  updateHud();
}

function beginPlay(): void {
  if (screen !== 'intro') return;
  clearTimeout(introTimer);
  screen = 'play';
  controls.reset();
  showOverlay(null);
}

function pauseGame(): void {
  if (screen !== 'play') return;
  screen = 'paused';
  controls.reset();
  refreshPauseMenu();
  showOverlay('pause-screen');
}

/** 지금 나가거나 다시 시작하면 생명을 잃는지. 30초가 지났거나 이미 쓰러지는 중이면 잃는다. */
const isLeaveCostly = (): boolean => playFrames >= FREE_LEAVE_FRAMES || world?.state === 'dying';

function refreshPauseMenu(): void {
  $('pause-stage').textContent = `${current.isSecret ? t('secret') : t('stage')} ${shortLabel(current)} · ${t(nameKey(current))}`;
  const isCostly = isLeaveCostly();
  document.querySelectorAll<HTMLElement>('#pause-screen .cost').forEach((el) => el.classList.toggle('hidden', !isCostly));
  const left = Math.ceil((FREE_LEAVE_FRAMES - playFrames) / 60);
  $('pause-note').textContent = isCostly ? t('lifeCost') : t('freeLeave', { n: left });
  $('pause-note').classList.toggle('is-free', !isCostly);
  refreshToggles();
}

function resumeGame(): void {
  if (screen !== 'paused') return;
  screen = 'play';
  controls.reset();
  showOverlay(null);
}

function loseLife(): void {
  spendLife(progress, cap(), stampNow());
  progress.isMidStage = false;
  session.lives = progress.lives;
  saveStore();
  if (progress.lives <= 0) gameOver();
  else showIntro();
}

/**
 * 스테이지 도중에 앱을 닫았던 기록이 있으면 생명 하나를 뺀다. 메뉴로 나갈 때와
 * 같은 규칙이다. 빠진 사실은 메인 메뉴에 알린다.
 */
function settleAway(): void {
  if (!progress.isMidStage) return;
  progress.isMidStage = false;
  spendLife(progress, cap(), stampNow());
  saveStore();
  titleNotice = [...(titleNotice ?? []), t('lifeLostAway')];
}

function stageClear(): void {
  if (!world) return;
  screen = 'clear';
  progress.isMidStage = false;
  const bonus = Math.ceil(world.timeLeft / 60) * TIME_BONUS_PER_SECOND;
  session.score += bonus;
  const notes: string[] = [];

  if (current.isSecret) {
    if (!progress.secretsCleared.includes(current.index)) progress.secretsCleared.push(current.index);
  } else {
    const stage = current.index;
    const now = stampNow();
    progress.clearedAt[stage] ??= now;
    if (world.hasRune && !progress.runes.includes(stage)) {
      const before = runeBonus(progress.runes.length);
      const chapter = chapterOf(stage);
      const wasOpen = isSecretUnlocked(chapter, progress.runes);
      progress.runes.push(stage);
      progress.runeAt[stage] = now;
      if (!wasOpen && isSecretUnlocked(chapter, progress.runes)) notes.push(t('secretUnlocked', { n: chapter + 1 }));
      const after = runeBonus(progress.runes.length);
      if (after.lives > before.lives) notes.push(t('runeBonusUp', { n: after.lives }));
    }
    // 마지막 스테이지를 깨도 자르지 않고 그대로 적는다. 나중에 스테이지가 늘면
    // 바로 다음 스테이지부터 이어서 할 수 있어야 하기 때문이다.
    progress.unlocked = Math.max(progress.unlocked, stage + 1);
    const openedBefore = progress.openedAt.length;
    applyReleases(progress, serverNow());
    if (progress.openedAt.length > openedBefore) {
      notes.push(...openedNotes(openedBefore));
    } else if (stage === lastOpenStage(progress)) {
      // 공개된 마지막 스테이지를 깼다: 다음 묶음이 언제 열리는지 알린다
      notes.push(...releaseLines());
    }
  }
  saveStore();

  $('clear-bonus').textContent = bonus.toLocaleString();
  $('clear-rune').classList.toggle('hidden', !world.hasRune);
  $('clear-notes').textContent = notes.join('\n');
  $('clear-notes').classList.toggle('hidden', notes.length === 0);
  showOverlay('clear-screen');
  updateHud();

  // 알림이 있으면 읽을 시간을 조금 더 준다
  clearTimer = window.setTimeout(
    () => {
      if (screen !== 'clear') return;
      if (current.isSecret) {
        finish(isTrueEnding(progress.secretsCleared) ? 'trueEnding' : 'secretClear');
      } else if (current.index + 1 > lastOpenStage(progress)) {
        finish('waiting');
      } else if (current.index + 1 >= LEVELS.length) {
        finish('allClear');
      } else {
        current = { isSecret: false, index: current.index + 1 };
        showIntro();
      }
    },
    CLEAR_SHOW_MS + notes.length * 1500,
  );
}

function gameOver(): void {
  playGameOver();
  finish('gameOver');
}

const ENDING_TEXT: Record<Ending, { title: MessageKey; text: MessageKey | null }> = {
  gameOver: { title: 'gameOver', text: null },
  allClear: { title: 'allClear', text: 'endingText' },
  secretClear: { title: 'secretClear', text: 'secretClearText' },
  trueEnding: { title: 'trueEnding', text: 'trueEndingText' },
  waiting: { title: 'waitingTitle', text: null },
};

function finish(ending: Ending): void {
  screen = 'end';
  clearTimeout(clearTimer);
  if (ending !== 'gameOver') playEnding();
  const isRecord = session.score > progress.best;
  if (isRecord) progress.best = session.score;
  saveStore();

  const { title, text } = ENDING_TEXT[ending];
  let body = text ? t(text) : '';
  if (ending === 'gameOver' && progress.lives <= 0) body = t('gameOverText');
  // 일반 스테이지를 다 깼는데 룬이 모자라면 비밀 스테이지를 귀띔한다
  if (ending === 'allClear' && progress.runes.length < runeTotal()) body += `\n\n${t('allClearHint')}`;
  if (ending === 'waiting') body = releaseLines().join('\n');
  $('end-title').textContent = t(title);
  $('end-title').classList.toggle('gold', ending !== 'gameOver');
  $('end-text').textContent = body;
  $('end-text').classList.toggle('hidden', !body);
  $('end-score').textContent = session.score.toLocaleString();
  $('end-record').classList.toggle('hidden', !isRecord || session.score === 0);
  $('end-runes').textContent = t('runesTotal', { got: progress.runes.length, total: runeTotal() });
  showOverlay('end-screen');
}

const hasRune = (level: LevelDef): boolean => /[r5]/.test(level.map.join(''));

function runeTotal(): number {
  return LEVELS.filter(hasRune).length;
}

function openStages(): void {
  refreshLives();
  const isOut = progress.lives <= 0;
  $('stages-lives').textContent = isOut
    ? t('noLivesStages', { time: formatLeft((nextLifeAt(progress, cap()) ?? 0) - stampNow()) })
    : '';
  $('stages-lives').classList.toggle('hidden', !isOut);
  const grid = $('stage-grid');
  grid.replaceChildren();
  LEVELS.forEach((_, n) => {
    const b = document.createElement('button');
    b.className = 'stage-cell';
    b.textContent = String(n + 1);
    const isReleased = n <= lastOpenStage(progress);
    b.disabled = n > progress.unlocked || !isReleased || isOut;
    b.title = b.disabled ? t('locked') : t(`stage${n + 1}` as MessageKey);
    // 다음 묶음의 첫 칸에 남은 날짜나 조건을 적는다
    if (!isReleased && n === lastOpenStage(progress) + 1) {
      const tag = document.createElement('small');
      tag.className = 'release-tag';
      tag.textContent = releaseTag();
      b.append(tag);
    }
    b.classList.toggle('is-cleared', n < progress.unlocked);
    b.classList.toggle('is-next', n === progress.unlocked);
    b.classList.toggle('has-rune', progress.runes.includes(n));
    b.addEventListener('click', () => startGame({ isSecret: false, index: n }));
    grid.append(b);
  });

  // 비밀 스테이지: 잠겨 있으면 그 장의 룬 수를 보여 준다
  const secrets = $('secret-grid');
  secrets.replaceChildren();
  CHAPTERS.forEach((_, i) => {
    const b = document.createElement('button');
    b.className = 'stage-cell secret';
    const isOpen = isSecretUnlocked(i, progress.runes);
    const { got, total } = chapterRunes(i, progress.runes);
    const label = document.createElement('span');
    label.textContent = `S${i + 1}`;
    const sub = document.createElement('small');
    sub.textContent = isOpen ? t(`secret${i + 1}` as MessageKey) : t('chapterRunes', { got, total });
    b.append(label, sub);
    b.disabled = !isOpen || isOut;
    b.classList.toggle('is-cleared', progress.secretsCleared.includes(i));
    b.addEventListener('click', () => startGame({ isSecret: true, index: i }));
    secrets.append(b);
  });
  $('stages-runes').textContent = t('runesTotal', { got: progress.runes.length, total: runeTotal() });
  showOverlay('stages-screen');
}

// ---------------------------------------------------------------- 공개 일정 안내

function formatDate(ms: number): string {
  return new Intl.DateTimeFormat(getLang(), {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(ms);
}

const stageRange = (batch: number) => ({ from: BATCHES[batch].first + 1, to: BATCHES[batch].last + 1 });
const isBatchBuilt = (batch: number): boolean => BATCHES[batch].first < LEVELS.length;

/** 다음 묶음이 언제, 어떤 조건으로 열리는지 알려 주는 문장들 */
function releaseLines(): string[] {
  const info = nextRelease(progress);
  if (!info) return [];
  // 공개는 됐는데 아직 만들지 않은 스테이지에서 멈춰 있다
  if (progress.unlocked >= LEVELS.length && progress.unlocked <= lastOpenStage(progress)) return [t('comingSoon')];
  if (!isBatchBuilt(info.batch)) {
    // 아직 만들지 않은 묶음도 열릴 날짜는 알려 준다. 그날이 지났으면 "준비 중"
    if (progress.unlocked < LEVELS.length) return [];
    if (info.earliestAt === null || info.earliestAt <= stampNow()) return [t('comingSoon')];
  }
  const range = stageRange(info.batch);
  const last = BATCHES[info.batch - 1].last + 1;
  const lines: string[] = [];
  if (info.earliestAt === null) {
    lines.push(t('releaseNextClear', { last, ...range }));
  } else if (info.needsClear) {
    lines.push(t('releaseNextBoth', { last, date: formatDate(info.earliestAt), ...range }));
  } else {
    lines.push(t('releaseNextDate', { date: formatDate(info.earliestAt), ...range }));
  }
  if (info.hasRuneBonus) {
    lines.push(t('releaseRuneBonus'));
  } else if (info.earliestAt !== null && info.runeBonusAt !== null && info.runeBonusAt < info.earliestAt) {
    const cur = stageRange(info.batch - 1);
    const at = Math.max(info.runeBonusAt, serverNow() ?? 0);
    lines.push(t('releaseRuneHint', { rfrom: cur.from, rto: cur.to, date: formatDate(at) }));
  }
  return lines;
}

/** 새로 열린 묶음 알림. 31~50 이 열릴 때는 매주 공개된다는 안내를 붙인다. */
function openedNotes(openedBefore: number): string[] {
  const notes: string[] = [];
  for (let b = openedBefore; b < progress.openedAt.length; b++) {
    if (!isBatchBuilt(b)) continue;
    notes.push(t('releaseOpened', stageRange(b)));
    if (b === 1) notes.push(t('releaseWeekly'));
  }
  return [...notes, ...releaseLines()];
}

/** 스테이지 고르기에서 다음 묶음 첫 칸에 붙이는 짧은 표시 */
function releaseTag(): string {
  const info = nextRelease(progress);
  if (!info) return '';
  if (!isBatchBuilt(info.batch)) return t('comingSoon');
  if (info.needsClear || info.earliestAt === null) return t('clearToOpen');
  const days = Math.max(1, Math.ceil((info.earliestAt - (serverNow() ?? Date.now())) / DAY_MS));
  return t('dayLeft', { n: days });
}

/** 타이틀에 한 번 보여 줄 공개 알림 (앱을 연 사이에 새 묶음이 열렸을 때) */
let titleNotice: string[] | null = null;

/** 서버 시각을 다시 확인하고, 조건이 채워진 묶음을 연다 */
async function checkReleases(): Promise<void> {
  const now = await syncServerTime();
  if (now !== null) prefs.lastServerTime = now;
  if (progress.name) {
    const before = progress.openedAt.length;
    if (applyReleases(progress, serverNow())) titleNotice = openedNotes(before);
  }
  saveStore();
  if (screen === 'title') refreshTitle();
}

// ---------------------------------------------------------------- 홈 화면 설치 안내

/** 설치 안내를 닫으면 갈 곳: 이름이 없으면 이름 등록, 있으면 타이틀 */
function showInstall(): void {
  screen = 'title';
  const ios = isIOS();
  document.querySelectorAll<HTMLElement>('.only-ios').forEach((el) => el.classList.toggle('hidden', !ios));
  document.querySelectorAll<HTMLElement>('.only-android').forEach((el) => el.classList.toggle('hidden', ios));
  $('btn-install').classList.toggle('hidden', ios || !canPromptInstall());
  showOverlay('install-screen');
}

function leaveInstall(): void {
  if (progress.name) goTitle();
  else showNameScreen();
}

onInstallChange(() => $('btn-install').classList.toggle('hidden', isIOS() || !canPromptInstall()));

// ---------------------------------------------------------------- 이름 등록

function showNameScreen(): void {
  screen = 'title';
  world = null;
  refreshNameScreen();
  $('name-error').classList.add('hidden');
  $<HTMLInputElement>('name-input').value = '';
  showOverlay('name-screen');
}

function refreshNameScreen(): void {
  const list = $('name-list');
  list.replaceChildren();
  const names = profileNames();
  $('name-existing').classList.toggle('hidden', names.length === 0);
  for (const name of names) {
    const row = document.createElement('div');
    row.className = 'name-row';
    const pick = document.createElement('button');
    pick.className = 'ghost name-pick';
    pick.textContent = name;
    pick.addEventListener('click', () => enterAs(name));
    const del = document.createElement('button');
    del.className = 'ghost small name-delete';
    del.textContent = t('nameDelete');
    del.addEventListener('click', () => {
      if (!window.confirm(t('nameDeleteConfirm', { name }))) return;
      deleteProfile(name);
      if (progress.name === name) progress = newProfile('', 0);
      refreshNameScreen();
    });
    row.append(pick, del);
    list.append(row);
  }
  $('name-legacy').classList.toggle('hidden', !hasLegacyProgress());
  $('btn-name-back').classList.toggle('hidden', !progress.name);
}

function enterAs(name: string): void {
  progress = selectProfile(name, stampNow());
  const before = progress.openedAt.length;
  if (applyReleases(progress, serverNow())) titleNotice = openedNotes(before);
  settleAway();
  saveStore();
  goTitle();
}

$('name-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = cleanName($<HTMLInputElement>('name-input').value);
  if (!name) {
    $('name-error').textContent = t('nameEmpty');
    $('name-error').classList.remove('hidden');
    return;
  }
  enterAs(name);
});

// ---------------------------------------------------------------- 백업 코드

let backupReturn = 'title-screen';

async function showBackup(from: string): Promise<void> {
  backupReturn = from;
  const hasProfile = Boolean(progress.name);
  $('backup-export').classList.toggle('hidden', !hasProfile);
  $('backup-message').classList.add('hidden');
  $<HTMLTextAreaElement>('backup-input').value = '';
  $('btn-backup-share').classList.toggle('hidden', typeof navigator.share !== 'function');
  showOverlay('backup-screen');
  if (hasProfile) {
    $('backup-note').textContent = t('backupExportNote', { name: progress.name });
    $<HTMLTextAreaElement>('backup-code').value = await encodeBackup(progress);
  }
}

function backupMessage(text: string, isError = false): void {
  const el = $('backup-message');
  el.textContent = text;
  el.classList.toggle('error', isError);
  el.classList.remove('hidden');
}

$('btn-backup-copy').addEventListener('click', async () => {
  const area = $<HTMLTextAreaElement>('backup-code');
  try {
    await navigator.clipboard.writeText(area.value);
  } catch {
    // 클립보드 권한이 없으면 글자를 골라 둔 채 옛 방식으로 복사한다
    area.select();
    document.execCommand('copy');
  }
  backupMessage(t('backupCopied'));
});

$('btn-backup-share').addEventListener('click', () => {
  void navigator.share?.({ title: "Merlin's Key", text: $<HTMLTextAreaElement>('backup-code').value }).catch(() => {});
});

$('btn-backup-import').addEventListener('click', async () => {
  const result = await decodeBackup($<HTMLTextAreaElement>('backup-input').value, stampNow());
  if ('error' in result) {
    const key = { format: 'backupErrFormat', checksum: 'backupErrChecksum', unsupported: 'backupErrUnsupported' } as const;
    backupMessage(t(key[result.error]), true);
    return;
  }
  const incoming = result.profile;
  if (profileNames().includes(incoming.name) && !window.confirm(t('backupOverwrite', { name: incoming.name }))) return;
  putProfile(incoming);
  progress = incoming;
  applyReleases(progress, serverNow());
  saveStore();
  backupReturn = 'title-screen';
  await showBackup('title-screen');
  backupMessage(t('backupLoaded', { name: incoming.name }));
});

$('btn-backup-close').addEventListener('click', () => {
  if (backupReturn === 'title-screen' && progress.name) goTitle();
  else showOverlay(backupReturn);
});

// ---------------------------------------------------------------- 버튼 연결

$('btn-change-name').addEventListener('click', showNameScreen);
$('btn-name-back').addEventListener('click', goTitle);
$('btn-backup').addEventListener('click', () => void showBackup('title-screen'));
$('btn-name-backup').addEventListener('click', () => void showBackup('name-screen'));
$('btn-install-how').addEventListener('click', showInstall);
$('btn-install').addEventListener('click', () => void promptInstall());
$('btn-install-skip').addEventListener('click', leaveInstall);
$('btn-play').addEventListener('click', () =>
  startGame({ isSecret: false, index: Math.min(progress.unlocked, playableLast()) }),
);
$('btn-stages').addEventListener('click', openStages);
$('btn-stages-back').addEventListener('click', () => showOverlay('title-screen'));

let howtoReturn = 'title-screen';
$('btn-howto').addEventListener('click', () => {
  howtoReturn = 'title-screen';
  showOverlay('howto-screen');
});
$('btn-howto2').addEventListener('click', () => {
  howtoReturn = 'pause-screen';
  showOverlay('howto-screen');
});
$('btn-howto-close').addEventListener('click', () => showOverlay(howtoReturn));

$('intro-screen').addEventListener('pointerdown', () => {
  unlockAudio();
  beginPlay();
});
$('btn-pause').addEventListener('click', pauseGame);
$('btn-resume').addEventListener('click', resumeGame);
$('btn-restart').addEventListener('click', () => {
  if (screen !== 'paused') return;
  if (isLeaveCostly()) loseLife();
  else showIntro();
});
$('btn-quit').addEventListener('click', () => {
  if (screen !== 'paused') return;
  if (isLeaveCostly()) spendLife(progress, cap(), stampNow());
  progress.isMidStage = false;
  if (session.score > progress.best) progress.best = session.score;
  saveStore();
  goTitle();
});
$('btn-end-ok').addEventListener('click', goTitle);

const toggleSound = () => {
  prefs.isSoundOn = !prefs.isSoundOn;
  setSoundEnabled(prefs.isSoundOn);
  saveStore();
  refreshToggles();
};
$('btn-sound').addEventListener('click', toggleSound);
$('btn-sound2').addEventListener('click', toggleSound);

function changeLang(lang: Lang): void {
  prefs.lang = lang;
  saveStore();
  setLang(lang);
  refreshTitle();
  refreshNameScreen();
  if (screen === 'paused') refreshPauseMenu();
}

document.querySelectorAll<HTMLButtonElement>('.lang-btn').forEach((b) => {
  const lang = b.dataset.lang as Lang;
  b.textContent = LANG_NAMES[lang];
  b.addEventListener('click', () => changeLang(lang));
});
document.querySelectorAll<HTMLButtonElement>('.lang-toggle').forEach((b) => {
  b.addEventListener('click', () => changeLang(getLang() === 'ko' ? 'en' : 'ko'));
});

const ICONS: Record<string, string> = {
  edit: ICON_EDIT,
  help: ICON_HELP,
  backup: ICON_BACKUP,
  play: ICON_PLAY,
  restart: ICON_RESTART,
  home: ICON_HOME,
  grid: ICON_GRID,
};
document.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
  el.innerHTML = ICONS[el.dataset.icon ?? ''] ?? '';
});
document.querySelectorAll<HTMLElement>('#pause-screen .cost').forEach((el) => {
  el.innerHTML = `${HEART}<span>−1</span>`;
});
const avatar = document.createElement('img');
avatar.src = sprite('merlinStand').toDataURL();
avatar.alt = '';
$('title-avatar').append(avatar);

// 다른 앱으로 넘어가면 멈춘다
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
  else void checkReleases();
});
// 확대와 길게 눌러 뜨는 메뉴를 막는다
blockZoom([$('stage-wrap'), $('controls')]);
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------- HUD

const hud = {
  stage: $('hud-stage'),
  score: $('hud-score'),
  lives: $('hud-lives'),
  fire: $('hud-fire'),
  key: $('item-key'),
  rune: $('item-rune'),
  timeFill: $('time-fill'),
  timeText: $('time-text'),
};
const keyIcon = document.createElement('img');
keyIcon.src = sprite('key').toDataURL();
keyIcon.alt = '';
hud.key.append(keyIcon);
hud.rune.innerHTML = RUNE;

let lastHud = '';
function updateHud(): void {
  if (!world) return;
  const seconds = Math.ceil(world.timeLeft / 60);
  const sig = [
    shortLabel(current),
    session.score,
    session.lives,
    session.fire,
    world.hasKey,
    world.hasRune,
    seconds,
    getLang(),
  ].join('|');
  if (sig === lastHud) return;
  lastHud = sig;
  hud.stage.textContent = shortLabel(current);
  hud.score.textContent = session.score.toLocaleString();
  paintHearts(hud.lives, session.lives);
  // 불꽃이 없어도 자리는 보이도록 빈 불꽃 하나를 둔다
  paintStock(hud.fire, session.fire, Math.max(1, session.fire), FLAME, FLAME_EMPTY, t('fireCount', { n: session.fire }));
  hud.key.classList.toggle('is-got', world.hasKey);
  hud.key.setAttribute('aria-label', t(world.hasKey ? 'keyLabel' : 'keyMissing'));
  hud.rune.classList.toggle('hidden', !hasRune(world.level));
  hud.rune.classList.toggle('is-got', world.hasRune);
  hud.rune.setAttribute('aria-label', t(world.hasRune ? 'runeLabel' : 'runeMissing'));
  const ratio = Math.min(1, world.timeLeft / (world.level.time * 60));
  hud.timeFill.style.transform = `scaleX(${ratio})`;
  hud.timeFill.classList.toggle('is-low', seconds <= 10);
  hud.timeText.textContent = String(seconds);
}

let toastTimer = 0;
function toast(text: string): void {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.add('hidden'), 1300);
}

function handleEvent(e: GameEvent): void {
  playEvent(e);
  if (e === 'die') navigator.vibrate?.(120);
  if (e === 'key') navigator.vibrate?.(30);
  if (e === 'hurry' && world && Math.ceil(world.timeLeft / 60) === 10) toast(t('hurry'));
  if (e === 'rune') toast(t('runeFound'));
}

// ---------------------------------------------------------------- 크기 맞추기

function layout(): void {
  const wrap = $('stage-wrap');
  const w = wrap.clientWidth - 8;
  const h = wrap.clientHeight - 8;
  const scale = Math.max(0.5, Math.min(w / VIEW_W, h / VIEW_H));
  const cssW = Math.floor(VIEW_W * scale);
  const cssH = Math.floor(VIEW_H * scale);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  renderer.resize(cssW);
}
window.addEventListener('resize', layout);
window.visualViewport?.addEventListener('resize', layout);

// ---------------------------------------------------------------- 루프

let last = performance.now();
let acc = 0;

function frame(now: number): void {
  acc += Math.min(100, now - last);
  last = now;

  while (acc >= STEP_MS) {
    acc -= STEP_MS;
    if (screen === 'play' && world) {
      if (world.state === 'play' && ++playFrames === FREE_LEAVE_FRAMES) {
        // 이제부터 나가면 생명을 잃는다. 앱을 꺼서 피하지 못하게 기록해 둔다.
        progress.isMidStage = true;
        saveStore();
      }
      for (const e of world.step(controls.read())) handleEvent(e);
      if (session.lives > progress.lives) {
        // 요정을 잡았다
        gainLife(progress, cap(), stampNow());
        session.lives = progress.lives;
        saveStore();
      }
      if (world.isDyingDone) {
        loseLife();
        break;
      }
      if (world.isClearDone) {
        stageClear();
        break;
      }
    }
  }

  if (world) {
    renderer.draw(world);
    updateHud();
  } else {
    renderer.drawIdle(now);
  }
  requestAnimationFrame(frame);
}

applyI18n(document);
// 이름이 있으면 메인 메뉴로, 없으면 (휴대폰 브라우저라면 설치 안내를 거쳐) 이름 등록으로
settleAway();
if (progress.name) goTitle();
else if (shouldSuggestInstall()) showInstall();
else showNameScreen();
layout();
void checkReleases();
window.setInterval(() => void checkReleases(), 5 * 60 * 1000);
// 메인 메뉴의 남은 시간(생명 충전, 다음 스테이지 공개)을 매초 고친다
window.setInterval(() => {
  if (screen !== 'title' || $('title-screen').classList.contains('hidden')) return;
  const before = progress.openedAt.length;
  if (progress.name && applyReleases(progress, serverNow())) {
    titleNotice = openedNotes(before);
    saveStore();
  }
  refreshTitle();
}, 1000);

// 개발 서버에서만: ?stage=3 이나 ?stage=S2 로 열면 그 스테이지를 바로 시작한다
if (import.meta.env.DEV) {
  const param = (new URLSearchParams(location.search).get('stage') ?? '').toUpperCase();
  const isSecret = param.startsWith('S');
  const n = Number(isSecret ? param.slice(1) : param);
  if (n >= 1 && n <= (isSecret ? SECRET_LEVELS : LEVELS).length) {
    if (!progress.name) progress = newProfile('dev', 0);
    startGame({ isSecret, index: n - 1 });
    beginPlay();
  }
}
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
