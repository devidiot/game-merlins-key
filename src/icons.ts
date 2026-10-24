/**
 * 화면에 쓰는 SVG 아이콘.
 *
 * HUD 의 하트·불꽃·룬은 게임 그림과 어울리도록 픽셀 그림으로 그린다. 글자 한 칸이
 * 한 픽셀이고, 글자마다 색을 정한다 (`.` 은 빈칸). 메뉴 아이콘은 선으로 그린다.
 */

function pixelSvg(rows: string[], colors: Record<string, string>): string {
  const paths: Record<string, string> = {};
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (colors[ch]) paths[ch] = `${paths[ch] ?? ''}M${x} ${y}h1v1h-1z`;
    });
  });
  const body = Object.entries(paths)
    .map(([ch, d]) => `<path fill="${colors[ch]}" d="${d}"/>`)
    .join('');
  return `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;
}

const HEART_ROWS = ['.##.##.', '#w#####', '#######', '.#####.', '..###..', '...#...'];

/** 채운 하트 */
export const HEART = pixelSvg(HEART_ROWS, { '#': '#ff4d6d', w: '#ffc2cc' });
/** 빈 하트 (상한까지 남은 자리) */
export const HEART_EMPTY = pixelSvg(HEART_ROWS, { '#': '#3a2a6e', w: '#3a2a6e' });

export const FLAME = pixelSvg(
  ['..#...', '..##..', '.###..', '.####.', '##yy##', '#yyyy#', '#yWWy#', '.#yy#.'],
  { '#': '#ff7a1c', y: '#ffd43b', W: '#fff7d6' },
);
export const FLAME_EMPTY = pixelSvg(
  ['..#...', '..##..', '.###..', '.####.', '######', '######', '######', '.####.'],
  { '#': '#3a2a6e' },
);

export const RUNE = pixelSvg(
  ['...#...', '..#v#..', '.#v.v#.', '#v...v#', '.#v.v#.', '..#v#..', '...#...'],
  { '#': '#b9a6ff', v: '#f1ecff' },
);

const line = (body: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON_SOUND_ON = line('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>');
export const ICON_SOUND_OFF = line('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/>');
export const ICON_HELP = line('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17.5v.01"/>');
export const ICON_GLOBE = line('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z"/>');
export const ICON_BACKUP = line('<path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5"/><path d="M12 12v8M9 15l3-3 3 3"/>');
export const ICON_EDIT = line('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>');
export const ICON_PLAY = line('<path d="M8 5v14l11-7z" fill="currentColor"/>');
export const ICON_RESTART = line('<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/>');
export const ICON_HOME = line('<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>');
export const ICON_GRID = line('<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>');
