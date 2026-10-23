/**
 * 서버 시각.
 *
 * 공개 일정은 기기 시계를 믿지 않는다. 시계를 앞으로 돌리면 스테이지가 미리 열리기
 * 때문이다. 대신 이 게임을 내려 주는 GitHub Pages 응답의 Date 헤더를 읽고, 그 뒤로
 * 흐른 시간은 기기 시계와 상관없는 단조 시계(performance.now)로 더한다.
 *
 * 오프라인이면 마지막으로 확인한 서버 시각에서 멈춘 채로 계산한다. 그동안은
 * 새로 열리지 않을 뿐 이미 열린 스테이지는 그대로 할 수 있다.
 */

let base: number | null = null;
let baseAt = 0;

/** 지금의 서버 기준 시각. 한 번도 확인하지 못했으면 null */
export function serverNow(): number | null {
  return base === null ? null : base + (performance.now() - baseAt);
}

/** 저장해 둔 마지막 서버 시각으로 시작한다 (오프라인 실행 대비) */
export function seedServerTime(lastKnown: number | null): void {
  if (lastKnown !== null && base === null) {
    base = lastKnown;
    baseAt = performance.now();
  }
}

/** 서버에 시각을 물어본다. 성공하면 그 시각을 돌려준다. */
export async function syncServerTime(): Promise<number | null> {
  try {
    const sentAt = performance.now();
    // 서비스 워커는 GET 만 가로채므로 HEAD 요청은 늘 네트워크로 간다
    const res = await fetch(`./?t=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
    const date = res.headers.get('date');
    const parsed = date ? Date.parse(date) : NaN;
    if (!Number.isFinite(parsed)) return serverNow();
    // Date 헤더는 초 단위라 왕복 시간의 절반을 더해 보정한다
    const arrivedAt = performance.now();
    const next = parsed + (arrivedAt - sentAt) / 2;
    // 시계가 뒤로 가지 않게 한다 (저장된 값보다 이른 응답은 무시)
    const current = serverNow();
    if (current === null || next > current) {
      base = next;
      baseAt = arrivedAt;
    }
    return serverNow();
  } catch {
    return serverNow();
  }
}
