/**
 * 화면 흐름과 게임 루프.
 *
 * 타이틀 → 스테이지 소개 → 플레이 → (클리어 → 다음 스테이지 소개) … → 엔딩
 *                              └ 목숨이 남으면 같은 스테이지 소개, 없으면 게임 오버
 *
 * 게임 로직은 60fps 고정 간격으로 돌리고, 그림은 화면 주사율대로 그린다.
 */
import './style.css';
import { playEnding, playEvent, playGameOver, setSoundEnabled, unlockAudio } from './audio.ts';
import { applyI18n, detectLang, getLang, LANG_NAMES, setLang, t, type Lang, type MessageKey } from './i18n.ts';
import { Controls } from './input.ts';
import { LEVELS } from './game/levels.ts';
import { blockZoom } from './no-zoom.ts';
import { VIEW_H, VIEW_W, World, type GameEvent, type Session } from './game/world.ts';
import { Renderer } from './render/renderer.ts';
import { sprite } from './render/sprites.ts';
import { loadProgress, saveProgress } from './storage.ts';

type Screen = 'title' | 'intro' | 'play' | 'paused' | 'clear' | 'end';

const STEP_MS = 1000 / 60;
const START_LIVES = 3;
const INTRO_AUTO_MS = 2600;
const CLEAR_SHOW_MS = 2200;
const TIME_BONUS_PER_SECOND = 10;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 가 없습니다`);
  return el as T;
};

const progress = loadProgress();
setSoundEnabled(progress.isSoundOn);
setLang(detectLang(progress.lang));

const canvas = $<HTMLCanvasElement>('game');
const renderer = new Renderer(canvas);
const controls = new Controls($('dpad'), {
  jump: $('btn-jump'),
  magic: $('btn-magic'),
  fire: $('btn-fire'),
});
controls.onFirstInput = unlockAudio;
controls.onPause = () => {
  if (screen === 'play') pauseGame();
  else if (screen === 'paused') resumeGame();
};

let screen: Screen = 'title';
let session: Session = { score: 0, lives: START_LIVES, fire: 0 };
let levelIndex = 0;
let world: World | null = null;
let introTimer = 0;
let clearTimer = 0;

// ---------------------------------------------------------------- 화면 전환

const OVERLAYS = ['title-screen', 'stages-screen', 'howto-screen', 'intro-screen', 'pause-screen', 'clear-screen', 'end-screen'];

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

function refreshTitle(): void {
  const cont = $('btn-continue');
  const next = Math.min(progress.unlocked, LEVELS.length - 1);
  cont.classList.toggle('hidden', next === 0);
  cont.textContent = t('continueFrom', { n: next + 1 });
  $('title-best').textContent = progress.best > 0 ? `${t('best')} ${progress.best.toLocaleString()}` : '';
  const soundLabel = t(progress.isSoundOn ? 'soundOn' : 'soundOff');
  $('btn-sound').textContent = soundLabel;
  $('btn-sound2').textContent = soundLabel;
  document.querySelectorAll<HTMLButtonElement>('.lang-btn').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.lang === getLang()));
  });
}

function startGame(stage: number): void {
  unlockAudio();
  session = { score: 0, lives: START_LIVES, fire: 0 };
  levelIndex = stage;
  showIntro();
}

function showIntro(): void {
  world = new World(levelIndex, session);
  screen = 'intro';
  controls.reset();
  $('intro-no').textContent = `${t('stage')} ${levelIndex + 1}`;
  $('intro-name').textContent = t(`stage${levelIndex + 1}` as MessageKey);
  const hint = t(`hint${levelIndex + 1}` as MessageKey);
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
  if (world.hasRune && !progress.runes.includes(levelIndex)) progress.runes.push(levelIndex);
  // 마지막 스테이지를 깨도 자르지 않고 그대로 적는다. 나중에 스테이지가 늘면
  // 바로 다음 스테이지부터 이어서 할 수 있어야 하기 때문이다.
  progress.unlocked = Math.max(progress.unlocked, levelIndex + 1);
  saveProgress(progress);

  $('clear-bonus').textContent = bonus.toLocaleString();
  $('clear-rune').classList.toggle('hidden', !world.hasRune);
  showOverlay('clear-screen');
  updateHud();

  clearTimer = window.setTimeout(() => {
    if (screen !== 'clear') return;
    if (levelIndex + 1 >= LEVELS.length) {
      finish(true);
    } else {
      levelIndex++;
      showIntro();
    }
  }, CLEAR_SHOW_MS);
}

function gameOver(): void {
  playGameOver();
  finish(false);
}

function finish(isAllClear: boolean): void {
  screen = 'end';
  clearTimeout(clearTimer);
  if (isAllClear) playEnding();
  const isRecord = session.score > progress.best;
  if (isRecord) progress.best = session.score;
  saveProgress(progress);

  $('end-title').textContent = t(isAllClear ? 'allClear' : 'gameOver');
  $('end-title').classList.toggle('gold', isAllClear);
  $('end-text').textContent = isAllClear ? t('endingText') : '';
  $('end-text').classList.toggle('hidden', !isAllClear);
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
    b.disabled = n > progress.unlocked;
    b.title = b.disabled ? t('locked') : t(`stage${n + 1}` as MessageKey);
    b.classList.toggle('is-cleared', n < progress.unlocked);
    b.classList.toggle('is-next', n === progress.unlocked);
    b.classList.toggle('has-rune', progress.runes.includes(n));
    b.addEventListener('click', () => startGame(n));
    grid.append(b);
  });
  $('stages-runes').textContent = t('runesTotal', { got: progress.runes.length, total: runeTotal() });
  showOverlay('stages-screen');
}

// ---------------------------------------------------------------- 버튼 연결

$('btn-start').addEventListener('click', () => startGame(0));
$('btn-continue').addEventListener('click', () => startGame(Math.min(progress.unlocked, LEVELS.length - 1)));
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
    saveProgress(progress);
  }
  goTitle();
});
$('btn-end-ok').addEventListener('click', goTitle);

const toggleSound = () => {
  progress.isSoundOn = !progress.isSoundOn;
  setSoundEnabled(progress.isSoundOn);
  saveProgress(progress);
  refreshTitle();
};
$('btn-sound').addEventListener('click', toggleSound);
$('btn-sound2').addEventListener('click', toggleSound);

document.querySelectorAll<HTMLButtonElement>('.lang-btn').forEach((b) => {
  const lang = b.dataset.lang as Lang;
  b.textContent = LANG_NAMES[lang];
  b.addEventListener('click', () => {
    progress.lang = lang;
    saveProgress(progress);
    setLang(lang);
    refreshTitle();
  });
});

// 다른 앱으로 넘어가면 멈춘다
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
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
  const sig = [levelIndex, session.score, session.lives, session.fire, world.hasKey, seconds, getLang()].join('|');
  if (sig === lastHud) return;
  lastHud = sig;
  hud.stage.textContent = String(levelIndex + 1);
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
goTitle();
layout();

// 개발 서버에서만: ?stage=3 으로 열면 그 스테이지를 바로 시작한다
if (import.meta.env.DEV) {
  const stage = Number(new URLSearchParams(location.search).get('stage'));
  if (stage >= 1 && stage <= LEVELS.length) {
    startGame(stage - 1);
    beginPlay();
  }
}
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
