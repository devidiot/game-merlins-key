/**
 * 화면 확대를 막는다.
 *
 * iOS Safari 는 접근성 때문에 viewport 의 `user-scalable=no` 를 무시한다. 그래서
 * 점프 버튼을 빠르게 두 번 누르면 더블탭 확대가 일어나고, 핀치를 막아 둔 탓에
 * 사용자가 되돌릴 수도 없게 된다. 확대가 일어나는 길을 하나씩 막는다.
 *
 * - 게임 화면과 조작부: 터치 기본 동작을 모두 끈다. 포인터 이벤트는 그대로 온다.
 * - 그 밖(오버레이 버튼 등): click 이 죽지 않도록 "짧은 간격의 두 번째 탭"만 막는다.
 * - 두 손가락 핀치, Safari 전용 gesture 이벤트, dblclick 을 막는다.
 * - 그래도 확대됐으면 viewport 메타를 다시 써서 1배로 되돌린다.
 */

const DOUBLE_TAP_MS = 350;
const VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

export function blockZoom(gameAreas: HTMLElement[]): void {
  const active = { passive: false } as const;

  for (const el of gameAreas) {
    el.addEventListener('touchstart', (e) => e.preventDefault(), active);
  }

  document.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    active,
  );
  document.addEventListener(
    'touchmove',
    (e) => {
      // iOS 의 TouchEvent 에는 핀치 배율(scale)이 붙어 온다
      const scale = (e as TouchEvent & { scale?: number }).scale;
      if (e.touches.length > 1 || (scale !== undefined && scale !== 1)) e.preventDefault();
    },
    active,
  );

  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      if (e.timeStamp - lastTouchEnd < DOUBLE_TAP_MS) e.preventDefault();
      lastTouchEnd = e.timeStamp;
    },
    active,
  );

  for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) {
    document.addEventListener(type, (e) => e.preventDefault(), active);
  }

  window.visualViewport?.addEventListener('resize', resetZoom);
  window.addEventListener('orientationchange', resetZoom);
}

/** 이미 확대된 화면을 1배로 되돌린다. viewport 메타를 바꿔 쓰면 Safari 가 다시 맞춘다. */
export function resetZoom(): void {
  const vv = window.visualViewport;
  if (!vv || vv.scale <= 1.01) return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  meta.content = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1';
  requestAnimationFrame(() => {
    meta.content = VIEWPORT;
  });
}
