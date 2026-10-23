/**
 * 홈 화면 설치 안내.
 *
 * iPhone 은 Safari 와 홈 화면 앱이 저장 공간을 따로 쓴다. Safari 에서 쌓은 기록은
 * 홈 화면 앱으로 넘어가지 않고, Safari 쪽 기록은 7일 동안 열지 않으면 지워질 수
 * 있다. 그래서 이름을 등록하기 전에 설치부터 안내한다.
 *
 * Android Chrome 은 beforeinstallprompt 로 설치 창을 바로 띄울 수 있다.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

let deferred: InstallPromptEvent | null = null;
/** 설치 창을 띄울 수 있게 되거나 설치가 끝나면 부른다 */
let onChange: (() => void) | null = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
  onChange?.();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  onChange?.();
});

export function onInstallChange(fn: () => void): void {
  onChange = fn;
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 는 데스크톱 Safari 처럼 자신을 Mac 이라고 알린다
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

/** 홈 화면 앱으로 실행 중인지 */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

/** 휴대폰 브라우저에서 열어서 설치를 권해야 하는지 */
export function shouldSuggestInstall(): boolean {
  return !isStandalone() && (isIOS() || isAndroid());
}

export const canPromptInstall = (): boolean => deferred !== null;

export async function promptInstall(): Promise<void> {
  if (!deferred) return;
  const e = deferred;
  deferred = null;
  await e.prompt();
  await e.userChoice.catch(() => undefined);
  onChange?.();
}
