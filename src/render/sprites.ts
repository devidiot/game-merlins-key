/**
 * 도트 그림 스프라이트.
 *
 * 그림 한 장은 16 × 16 글자 배열이고, 글자 하나가 픽셀 하나다. `.` 은 투명이다.
 * 처음 쓸 때 작은 캔버스에 한 번 그려 두고, 그 뒤로는 drawImage 로 찍기만 한다.
 * 모든 그림은 오른쪽을 보고 있고, 왼쪽은 뒤집어서 그린다.
 */

export const PALETTE: Record<string, string> = {
  k: '#1a1030', // 외곽선
  h: '#6c3fc9', // 모자
  H: '#9a6cf0', // 모자 밝은 면
  y: '#ffd43b', // 별, 금빛
  Y: '#fff3a3',
  s: '#ffcf9e', // 피부
  w: '#f1f3f5', // 수염
  b: '#2f4fb8', // 로브
  B: '#5f8cff',
  n: '#6b3b1e', // 신발
  G: '#5cc05c', // 고블린
  g: '#2f7f3a',
  R: '#e0663a', // 오우거
  r: '#b0222f', // 입, 붉은 눈
  W: '#cfe6ff', // 위습
  V: '#8fb8ff',
  S: '#8a8fa3', // 가고일 돌
  T: '#5b6075',
  j: '#c0392b', // 항아리
  J: '#e86a50',
  o: '#ff9f1c', // 불꽃
  c: '#7a4a1e', // 모래시계 나무
  q: '#f4e1b0', // 모래
};

type Art = string[];

const MERLIN_STAND: Art = [
  '.......kk.......',
  '......khHk......',
  '.....khyHhk.....',
  '.....khhhhk.....',
  '....khhhhhhk....',
  '...kkkkkkkkkk...',
  '.....kssssk.....',
  '.....ksssksk....',
  '.....kwwwwwk....',
  '....kbwwwwwbk...',
  '...kbbbwwwbBBk..',
  '...kbbbbbbbBsk..',
  '...kbbbbbbbbk...',
  '...kbBbbbbbbk...',
  '....kbbbbbbk....',
  '....knnk.knnk...',
];

const MERLIN_WALK: Art = [
  ...MERLIN_STAND.slice(0, 13),
  '...kbBbbbbbbbk..',
  '...kbbbkkkbbbk..',
  '...knnk...knnk..',
];

const MERLIN_CAST: Art = [
  ...MERLIN_STAND.slice(0, 9),
  '....kbwwwwwbk...',
  '...kbbbwwwbBBBky',
  '...kbbbbbbbbk.yY',
  ...MERLIN_STAND.slice(12),
];

/** 웅크린 모습: 모자부터 수염까지를 3줄 내리고 몸통을 줄인다 */
const MERLIN_CROUCH: Art = [
  '................',
  '................',
  '................',
  ...MERLIN_STAND.slice(0, 10),
  '...kbbbbbbbBsk..',
  '...kbbbbbbbbbk..',
  '...knnkkkkknnk..',
];

const GOBLIN: Art = [
  '................',
  '................',
  '....kkkkkkk.....',
  '...kGGGGGGGk....',
  '..kGGGGGGGGGk...',
  '..kGGGGGwkGwk...',
  '.kGGGGGGwkGwk...',
  '.kGGGGGGGGGGk...',
  '.kGGGGGrrrrGk...',
  '..kGGGGGGGGk....',
  '...kkggggkk.....',
  '..kGGkggkGGk....',
  '.kGGGkggkGGGk...',
  '..kkkggggkkk....',
  '....kgk.kgk.....',
  '....kkk.kkk.....',
];

const GOBLIN_STEP: Art = [
  ...GOBLIN.slice(0, 14),
  '...kgk...kgk....',
  '...kkk...kkk....',
];

const OGRE: Art = [
  '..k.........k...',
  '..kyk.....kyk...',
  '...kkkkkkkkk....',
  '..kRRRRRRRRRk...',
  '.kRRRRRRRRRRRk..',
  '.kRRRRRRwkRwkk..',
  'kRRRRRRRwrRwrk..',
  'kRRRRRRRRRRRRk..',
  'kRRRRRRwkwkwRk..',
  '.kRRRRRkkkkkk...',
  '..kkrrrrrrkk....',
  '.kRRkrrrrkRRk...',
  'kRRRkrrrrkRRRk..',
  '.kkkrrrrrrkkk...',
  '...krrk.krrk....',
  '...kkkk.kkkk....',
];

const WISP: Art = [
  '................',
  '.....kkkkkk.....',
  '....kWWWWWWk....',
  '...kWWWWWWWWk...',
  '..kWWWkkWWkkWk..',
  '..kWWWkkWWkkWk..',
  '..kWWWWWWWWWWk..',
  '..kWWWWWkkWWWk..',
  '..kWWWWWWWWWWk..',
  '..kVWWWWWWWWWk..',
  '..kVVWWWWWWWWk..',
  '..kVVkWWWkWWVk..',
  '..kVk.kWk.kVVk..',
  '..kk...k...kk...',
  '................',
  '................',
];

const TURRET: Art = [
  '................',
  '..k..........k..',
  '.kSk........kSk.',
  '.kSSkkkkkkkkSSk.',
  '..kSSSSSSSSSSk..',
  '..kSSSSSSSSSSk..',
  '..kSrrSSSSSrrk..',
  '..kSrrSSSSSrrk..',
  '..kSSSSSSSSSSk..',
  '..kSSSSkkkkkkkk.',
  '..kTSSkwkwkwkk..',
  '..kTSSkkkkkkkkk.',
  '..kTTSSSSSSSSk..',
  '..kTTTSSSSSSSk..',
  '..kkkkkkkkkkkk..',
  '................',
];

const KEY: Art = [
  '................',
  '................',
  '.....kkkk.......',
  '....kyyyyk......',
  '...kyYkkyyk.....',
  '...kyk..kyk.....',
  '...kyk..kyk.....',
  '...kyykkyyk.....',
  '....kyyyyk......',
  '.....kyyk.......',
  '.....kyyk.......',
  '.....kyyykk.....',
  '.....kyyyyk.....',
  '.....kyykk......',
  '.....kyyyyk.....',
  '......kkkk......',
];

const JAR: Art = [
  '................',
  '......kok.......',
  '.....koYok......',
  '......kok.......',
  '.....kkkkk......',
  '.....kJJJk......',
  '....kjJJJjk.....',
  '...kjJJJJJjk....',
  '...kjJYJJJjk....',
  '...kjJYJJJjk....',
  '...kjJJJJJjk....',
  '...kjjJJJjjk....',
  '....kjjjjjk.....',
  '.....kkkkk......',
  '................',
  '................',
];

const HOURGLASS: Art = [
  '................',
  '...kkkkkkkkk....',
  '...kcccccccck...',
  '....kWWWWWWk....',
  '....kWqqqqWk....',
  '.....kWqqWk.....',
  '......kqqk......',
  '......kWWk......',
  '.....kWWqWk.....',
  '....kWWqqWWk....',
  '....kWqqqqWk....',
  '...kcccccccck...',
  '...kkkkkkkkkk...',
  '................',
  '................',
  '................',
];

const BELL: Art = [
  '................',
  '.......kk.......',
  '......kyyk......',
  '.....kyYyyk.....',
  '....kyYyyyyk....',
  '....kyYyyyyk....',
  '....kyyyyyyk....',
  '...kyYyyyyyyk...',
  '...kyyyyyyyyk...',
  '..kyyyyyyyyyyk..',
  '..kkkkkkkkkkkk..',
  '.......kyk......',
  '........k.......',
  '................',
  '................',
  '................',
];

export const ART = {
  merlinStand: MERLIN_STAND,
  merlinWalk: MERLIN_WALK,
  merlinCast: MERLIN_CAST,
  merlinCrouch: MERLIN_CROUCH,
  goblin: GOBLIN,
  goblinStep: GOBLIN_STEP,
  ogre: OGRE,
  wisp: WISP,
  turret: TURRET,
  key: KEY,
  jar: JAR,
  hourglass: HOURGLASS,
  bell: BELL,
} as const;

export type ArtName = keyof typeof ART;

const cache = new Map<string, HTMLCanvasElement>();

/** 그림 한 장을 캔버스로 만든다. isFlipped 면 좌우를 뒤집는다. */
export function sprite(name: ArtName, isFlipped = false): HTMLCanvasElement {
  const id = `${name}:${isFlipped ? 1 : 0}`;
  const hit = cache.get(id);
  if (hit) return hit;

  const art = ART[name];
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < 16; y++) {
    const row = art[y] ?? '';
    for (let x = 0; x < 16; x++) {
      const ch = row[x] ?? '.';
      const color = PALETTE[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(isFlipped ? 15 - x : x, y, 1, 1);
    }
  }
  cache.set(id, canvas);
  return canvas;
}
