/**
 * Merlin's Key 서비스 워커.
 *
 * 설치되는 순간 게임 전체를 미리 받아둔다(PRECACHE). 그래서 홈 화면에 추가한 뒤
 * 한 번만 열어보면 그 뒤로는 비행기 모드에서도 그대로 돌아간다.
 *
 * 빌드 산출물 파일명에는 해시가 붙으므로 아래 두 줄은 빌드 때
 * scripts/precache-sw.mjs 가 실제 목록으로 갈아끼운다.
 */
const CACHE = 'merlins-key-dev';
const PRECACHE = ['./index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // addAll 은 하나만 실패해도 전부 취소되므로 개별로 받는다
      Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {}))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.location.origin)) return;

  // 문서(index.html)만은 네트워크를 먼저 본다.
  //
  // 캐시부터 주면 새로 배포한 판이 항상 **한 박자 늦게** 도착한다.
  // 첫 실행은 옛 index.html(=옛 해시의 JS)을 그대로 쓰고, 다음 실행에서야
  // 새 판이 나오기 때문이다. 문서 하나는 몇 KB라 네트워크로 받아도 부담이
  // 없고, 실패하면 아래처럼 캐시로 떨어지므로 오프라인 실행도 그대로다.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match('./index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          if (cached) return cached;
          // 주소 끝에 index.html 을 안 붙이고 들어온 경우까지 받아준다
          if (request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });

      // 캐시가 있으면 즉시 응답하고 갱신은 뒤에서 진행한다
      return cached || network;
    }),
  );
});
