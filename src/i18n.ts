/**
 * 화면 문구(영어·한국어)와 언어 결정.
 *
 * 언어는 다음 순서로 정한다.
 * 1. 사용자가 고른 언어 (localStorage)
 * 2. 주소의 `?lang=ko` / `?lang=en`
 * 3. 브라우저 언어 (`navigator.languages`, `ko-KR` 은 `ko` 로 줄여 비교)
 * 4. 기본값 `en`
 *
 * HTML 에서는 `data-i18n="키"` 를 붙이면 textContent 를, `data-i18n-aria="키"` 를
 * 붙이면 aria-label 을 바꾼다.
 */

const EN = {
  tagline: 'Cast stone, find the key, open the door.',
  start: 'Start',
  continueFrom: 'Continue from stage {n}',
  stageSelect: 'Stages',
  howToPlay: 'How to play',
  soundOn: 'Sound on',
  soundOff: 'Sound off',
  language: 'Language',
  back: 'Back',
  close: 'Close',
  pause: 'Pause',
  paused: 'Paused',
  resume: 'Resume',
  restartStage: 'Restart stage (−1 life)',
  quitToTitle: 'Quit to title',
  stage: 'STAGE',
  score: 'SCORE',
  best: 'BEST',
  lives: 'Lives',
  fire: 'Fire',
  jump: 'Jump',
  magic: 'Magic',
  gameOver: 'GAME OVER',
  stageClear: 'STAGE CLEAR',
  timeBonus: 'Time bonus',
  runeFound: 'Rune found',
  allClear: 'You opened every door!',
  endingText: 'The last door swings open and Merlin steps into the morning light.',
  runesTotal: 'Runes {got} / {total}',
  finalScore: 'Final score',
  newRecord: 'New record!',
  ok: 'OK',
  locked: 'Locked',
  ready: 'Ready',
  hurry: 'Hurry!',
  tapToStart: 'Tap to start',
  howTo1: 'Get the key, then walk into the open door.',
  howTo2: 'Magic creates a stone block in front of you, or breaks one that is already there.',
  howTo3: 'Hold down and cast to aim one step lower. Build bridges this way.',
  howTo4: 'Jump into a block from below twice to break it. Some blocks hide items.',
  howTo5: 'Fire jars give you fireballs that defeat enemies.',
  howTo6: 'Ring a bell and catch the fairy for an extra life.',
  howTo7: 'Watch the clock. When it runs out, you lose a life.',
  howToKeys: 'Keyboard: arrows to move, Z or Space to jump, X magic, C fire, P pause.',
  stage1: 'The First Spell',
  stage2: 'Hidden Key',
  stage3: 'Ring of Sparks',
  stage4: 'Wisp Gallery',
  stage5: 'Gargoyle',
  stage6: 'Fire Jars',
  stage7: "Ogre's Vault",
  stage8: 'Endless Mirror',
  stage9: 'Spark Maze',
  stage10: 'Wisp Storm',
  stage11: 'The Tower',
  stage12: "Merlin's Vault",
  hint1: 'Press Magic to make a block. Climb it like a step.',
  hint2: 'The key is inside a block. Jump into it from below twice.',
  hint3: 'Hold down and press Magic to build a bridge.',
  hint4: 'Wisps smash any block they fly into.',
  hint5: 'A stone block stops gargoyle fire.',
  hint6: 'Grab a fire jar, then press Fire.',
  hint7: 'Ogres break blocks in their way.',
  hint8: 'The mirror keeps sending goblins. Be quick.',
  hint9: '',
  hint10: '',
  hint11: '',
  hint12: '',
};

export type MessageKey = keyof typeof EN;
/** 한국어 쪽에 키가 빠지거나 남으면 타입 검사에서 걸린다 */
type Messages = Record<MessageKey, string>;

const KO: Messages = {
  tagline: '돌을 부르고, 열쇠를 찾아, 문을 여세요.',
  start: '시작',
  continueFrom: '{n}스테이지부터 계속',
  stageSelect: '스테이지',
  howToPlay: '게임 방법',
  soundOn: '소리 켬',
  soundOff: '소리 끔',
  language: '언어',
  back: '뒤로',
  close: '닫기',
  pause: '일시정지',
  paused: '일시정지',
  resume: '계속하기',
  restartStage: '스테이지 다시 하기 (목숨 −1)',
  quitToTitle: '타이틀로',
  stage: 'STAGE',
  score: 'SCORE',
  best: 'BEST',
  lives: '목숨',
  fire: '불꽃',
  jump: '점프',
  magic: '마법',
  gameOver: 'GAME OVER',
  stageClear: 'STAGE CLEAR',
  timeBonus: '시간 보너스',
  runeFound: '룬 발견',
  allClear: '모든 문을 열었습니다!',
  endingText: '마지막 문이 열리고, 멀린은 아침 햇살 속으로 걸어 나갑니다.',
  runesTotal: '룬 {got} / {total}',
  finalScore: '최종 점수',
  newRecord: '신기록!',
  ok: '확인',
  locked: '잠김',
  ready: '준비',
  hurry: '서두르세요!',
  tapToStart: '탭해서 시작',
  howTo1: '열쇠를 얻은 뒤 열린 문으로 들어가면 다음 스테이지로 넘어갑니다.',
  howTo2: '마법을 쓰면 바로 앞에 돌 블록을 만들고, 블록이 있으면 부숩니다.',
  howTo3: '아래를 누른 채 마법을 쓰면 한 칸 아래를 노립니다. 다리를 놓을 때 씁니다.',
  howTo4: '아래에서 블록에 두 번 박치기하면 깨집니다. 블록 속에 아이템이 숨어 있기도 합니다.',
  howTo5: '불꽃 항아리를 모으면 불꽃을 던져 적을 쓰러뜨릴 수 있습니다.',
  howTo6: '종을 울린 뒤 날아오르는 요정을 잡으면 목숨이 늘어납니다.',
  howTo7: '시간이 다 되면 목숨을 하나 잃습니다.',
  howToKeys: '키보드: 방향키 이동, Z 또는 Space 점프, X 마법, C 불꽃, P 일시정지',
  stage1: '첫 주문',
  stage2: '숨은 열쇠',
  stage3: '스파크의 고리',
  stage4: '위습의 회랑',
  stage5: '가고일',
  stage6: '불꽃 항아리',
  stage7: '오우거의 금고',
  stage8: '끝없는 거울',
  stage9: '스파크의 미로',
  stage10: '위습 폭풍',
  stage11: '탑',
  stage12: '멀린의 금고',
  hint1: '마법 버튼으로 블록을 만들고 계단처럼 밟고 오르세요.',
  hint2: '열쇠는 블록 속에 있습니다. 아래에서 두 번 박치기하세요.',
  hint3: '아래를 누른 채 마법을 쓰면 다리를 놓을 수 있습니다.',
  hint4: '위습은 부딪힌 블록을 부숩니다.',
  hint5: '가고일의 불은 돌 블록으로 막을 수 있습니다.',
  hint6: '불꽃 항아리를 얻은 뒤 불꽃 버튼을 누르세요.',
  hint7: '오우거는 앞을 막는 블록을 부숩니다.',
  hint8: '거울에서 고블린이 계속 나옵니다. 서두르세요.',
  hint9: '',
  hint10: '',
  hint11: '',
  hint12: '',
};

export type Lang = 'en' | 'ko';
const RESOURCES: Record<Lang, Messages> = { en: EN, ko: KO };
export const LANG_NAMES: Record<Lang, string> = { en: 'English', ko: '한국어' };

let current: Lang = 'en';

const toLang = (tag: string | null | undefined): Lang | null => {
  const base = (tag ?? '').toLowerCase().split('-')[0];
  return base === 'ko' || base === 'en' ? base : null;
};

/** 저장된 선택 → 주소 → 브라우저 언어 → 영어 순으로 고른다 */
export function detectLang(saved: string | null): Lang {
  const fromSaved = toLang(saved);
  if (fromSaved) return fromSaved;
  const fromQuery = toLang(new URLSearchParams(location.search).get('lang'));
  if (fromQuery) return fromQuery;
  for (const tag of navigator.languages ?? [navigator.language]) {
    const lang = toLang(tag);
    if (lang) return lang;
  }
  return 'en';
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
  applyI18n(document);
}

export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  const text = RESOURCES[current][key] ?? EN[key];
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

export function applyI18n(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as MessageKey);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria as MessageKey));
  });
}
