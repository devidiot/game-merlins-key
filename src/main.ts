/**
 * 화면 흐름과 게임 루프.
 *
 * 타이틀 → 스테이지 소개 → 플레이 → (클리어 → 다음 스테이지 소개) … → 엔딩
 *                              └ 목숨이 남으면 같은 스테이지 소개, 없으면 게임 오버
 *
 * 비밀 스테이지는 스테이지 고르기에서 하나씩 한다. 깨면 결과 화면으로 가고,
 * 다섯 개를 모두 깨면 진짜 엔딩이다. 룬 규칙은 progression.ts 에 있다.
 *
 * 처음 실행하면 (휴대폰 브라우저라면 홈 화면 설치 안내 →) 이름 등록 → 타이틀 순이다.
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
import { chapterOf, chapterRunes, isSecretUnlocked, isTrueEnding, runeBonus, startingKit } from './progression.ts';
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

function refreshTitle(): void {
  $('title-player').textContent = progress.name;
  $('title-browser-warning').classList.toggle('hidden', !shouldSuggestInstall());

  const cont = $<HTMLButtonElement>('btn-continue');
  const next = progress.unlocked;
  const isWaiting = next > playableLast();
  cont.classList.toggle('hidden', next === 0);
  cont.disabled = isWaiting;
  if (!isWaiting) {
    cont.textContent = t('continueFrom', { n: next + 1 });
  } else {
    const info = nextRelease(progress);
    const isBuilt = next < LEVELS.length;
    cont.textContent =
      info?.earliestAt && isBuilt ? t('continueWait', { date: formatDate(info.earliestAt) }) : t('comingSoon');
  }
  const release = titleNotice ?? releaseLines();
  $('title-release').textContent = release.join('\n');
  $('title-release').classList.toggle('hidden', release.length === 0);
  $('title-best').textContent = progress.best > 0 ? `${t('best')} ${progress.best.toLocaleString()}` : '';
  const bonus = runeBonus(progress.runes.length);
  $('title-bonus').textContent = t('runeBonus', { n: bonus.lives });
  $('title-bonus').classList.toggle('hidden', bonus.lives === 0);
  const soundLabel = t(prefs.isSoundOn ? 'soundOn' : 'soundOff');
  $('btn-sound').textContent = soundLabel;
  $('btn-sound2').textContent = soundLabel;
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
  titleNotice = null;
  // 룬 10개마다 목숨과 불꽃을 하나씩 더 들고 시작한다
  const kit = startingKit(progress.runes.length);
  session = { score: 0, lives: kit.lives, fire: kit.fire };
  current = ref;
  showIntro();
}

function showIntro(): void {
  world = new World(levelOf(current), session);
  screen = 'intro';
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
  refreshTitle();
  showOverlay('pause-screen');
}

function resumeGame(): void {
  if (screen !== 'paused') return;
  screen = 'play';
  controls.reset();
  showOverlay(null);
}

function loseLife(): void {
  session.lives--;
  if (session.lives <= 0) gameOver();
  else showIntro();
}

function stageClear(): void {
  if (!world) return;
  screen = 'clear';
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

function runeTotal(): number {
  return LEVELS.filter((l) => /[r5]/.test(l.map.join(''))).length;
}

function openStages(): void {
  const grid = $('stage-grid');
  grid.replaceChildren();
  LEVELS.forEach((_, n) => {
    const b = document.createElement('button');
    b.className = 'stage-cell';
    b.textContent = String(n + 1);
    const isReleased = n <= lastOpenStage(progress);
    b.disabled = n > progress.unlocked || !isReleased;
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
    b.disabled = !isOpen;
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
  if (!isBatchBuilt(info.batch)) return progress.unlocked >= LEVELS.length ? [t('comingSoon')] : [];
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

$('btn-start').addEventListener('click', () => startGame({ isSecret: false, index: 0 }));
$('btn-change-name').addEventListener('click', showNameScreen);
$('btn-name-back').addEventListener('click', goTitle);
$('btn-backup').addEventListener('click', () => void showBackup('title-screen'));
$('btn-name-backup').addEventListener('click', () => void showBackup('name-screen'));
$('btn-install-how').addEventListener('click', showInstall);
$('btn-install').addEventListener('click', () => void promptInstall());
$('btn-install-skip').addEventListener('click', leaveInstall);
$('btn-continue').addEventListener('click', () =>
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
  if (screen === 'paused') loseLife();
});
$('btn-quit').addEventListener('click', () => {
  if (session.score > progress.best) {
    progress.best = session.score;
    saveStore();
  }
  goTitle();
});
$('btn-end-ok').addEventListener('click', goTitle);

const toggleSound = () => {
  prefs.isSoundOn = !prefs.isSoundOn;
  setSoundEnabled(prefs.isSoundOn);
  saveStore();
  refreshTitle();
};
$('btn-sound').addEventListener('click', toggleSound);
$('btn-sound2').addEventListener('click', toggleSound);

document.querySelectorAll<HTMLButtonElement>('.lang-btn').forEach((b) => {
  const lang = b.dataset.lang as Lang;
  b.textContent = LANG_NAMES[lang];
  b.addEventListener('click', () => {
    prefs.lang = lang;
    saveStore();
    setLang(lang);
    refreshTitle();
    refreshNameScreen();
  });
});

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
  key: $('hud-key'),
  timeFill: $('time-fill'),
  timeText: $('time-text'),
};
hud.lives.style.setProperty('--icon', `url(${sprite('merlinStand').toDataURL()})`);
hud.fire.style.setProperty('--icon', `url(${sprite('jar').toDataURL()})`);
hud.key.style.setProperty('--icon', `url(${sprite('key').toDataURL()})`);

let lastHud = '';
function updateHud(): void {
  if (!world) return;
  const seconds = Math.ceil(world.timeLeft / 60);
  const sig = [shortLabel(current), session.score, session.lives, session.fire, world.hasKey, seconds, getLang()].join('|');
  if (sig === lastHud) return;
  lastHud = sig;
  hud.stage.textContent = shortLabel(current);
  hud.score.textContent = session.score.toLocaleString();
  hud.lives.textContent = String(session.lives);
  hud.fire.textContent = String(session.fire);
  hud.key.classList.toggle('has-key', world.hasKey);
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
      for (const e of world.step(controls.read())) handleEvent(e);
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
// 이름이 있으면 타이틀로, 없으면 (휴대폰 브라우저라면 설치 안내를 거쳐) 이름 등록으로
if (progress.name) goTitle();
else if (shouldSuggestInstall()) showInstall();
else showNameScreen();
layout();
void checkReleases();
window.setInterval(() => void checkReleases(), 5 * 60 * 1000);

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
