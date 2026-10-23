/**
 * 플레이어 이름 다듬기.
 *
 * 이름은 한글·영문·한자·가나·이모지 무엇이든 받는다. 같은 이름을 다시 넣으면 그
 * 기록으로 이어서 하므로, 보기에는 같은데 내부 코드가 다른 이름이 둘로 갈리지
 * 않도록 유니코드 정규화(NFC)를 한다.
 */

export const NAME_MAX = 12;

/** 글자 수를 사람이 보는 단위(자소 묶음)로 센다. 이모지 하나도 한 글자다. */
function graphemes(text: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Segmenter) return [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((s) => s.segment);
  return Array.from(text);
}

/**
 * 입력한 이름을 저장할 형태로 바꾼다. 쓸 수 없으면 null.
 * 앞뒤 공백과 보이지 않는 제어 문자를 지우고, 연속 공백은 하나로 줄이고,
 * NAME_MAX 글자에서 자른다.
 */
export function cleanName(input: string): string | null {
  const text = input
    .normalize('NFC')
    // 제어 문자, 줄바꿈, 방향 제어 문자 같은 보이지 않는 글자를 뺀다 (이모지 결합용 ZWJ 는 남긴다)
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, (ch) => (ch === '‍' ? ch : ''))
    .replace(/\s+/gu, ' ')
    .trim();
  if (!text) return null;
  return graphemes(text).slice(0, NAME_MAX).join('').trim() || null;
}
