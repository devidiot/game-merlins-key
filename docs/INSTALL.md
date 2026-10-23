# 개발과 설치

## 개발 서버

```bash
npm install
npm run dev
```

터미널에 뜨는 `Network:` 주소를 같은 Wi-Fi 의 폰 브라우저로 열면 바로 해 볼 수 있다.
개발 서버에서는 `?stage=5` 를 붙이면 그 스테이지가 바로 시작되고, `?lang=ko` 로 언어를 고정할 수 있다.

## 배포

```bash
npm run deploy
```

빌드한 `dist` 를 `gh-pages` 브랜치에 올린다. 소스는 `main`, 배포본은 `gh-pages` 에 둔다.
반영까지 30초~1분 걸린다. 주소는 https://devidiot.github.io/game-merlins-key/ 이다.

검색엔진·AI 크롤러 수집은 막아 두었다. GitHub Pages 의 하위 경로에서는 `robots.txt` 가
적용되지 않으므로 `index.html` 의 `<meta name="robots" content="noindex, ...">` 가 실제로
막는다. 둘 다 강제력이 없는 권고라서, 주소를 아는 사람은 누구나 접속할 수 있다.

## 폰에 설치

휴대폰 브라우저로 처음 열면 게임이 먼저 설치 방법을 안내한다. iPhone 은 Safari 와 홈 화면 앱이
저장 공간을 따로 쓰기 때문에, **이름을 등록하기 전에** 홈 화면에 추가하는 것이 좋다. Safari 에서
이미 진행했다면 타이틀의 "백업 코드"로 복사해 홈 화면 앱에 붙여 넣는다.


- **iPhone**: Safari 로 주소를 열고 공유 → 홈 화면에 추가. 홈 화면 아이콘으로 한 번은
  인터넷이 연결된 상태에서 열어야 게임 전체가 저장되어 그 뒤로 오프라인에서도 돈다.
- **Android**: Chrome 으로 열고 메뉴 → 홈 화면에 추가(앱 설치).
