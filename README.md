# Merlin's Key

마법사 멀린이 돌 블록을 만들고 부수며 열쇠를 찾아 문을 여는 퍼즐 액션 게임이다.
1986년 아케이드 게임 "솔로몬의 열쇠"의 규칙에 경의를 표하는 작품이며, 이름·그림·
스테이지는 모두 새로 만들었다.

- 플레이: https://devidiot.github.io/game-merlins-key/
- 휴대폰 세로·가로 화면, PC 키보드 모두 지원
- 영어·한국어 (브라우저 언어로 자동 선택, 메인 메뉴와 일시정지 화면에서 전환)
- 홈 화면에 추가하면 오프라인으로도 실행 (휴대폰 브라우저로 열면 설치 방법을 안내)
- 이름별 기록, 백업 코드로 다른 기기에 옮기기
- 처음 30스테이지 → 30을 깨면 50까지 → 그 뒤 매주 20개씩 공개 (룬을 다 모으면 3일 만에)

## 문서

| 문서 | 내용 |
|---|---|
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | 규칙, 적, 아이템, 스테이지 만드는 법 |
| [docs/INSTALL.md](docs/INSTALL.md) | 개발 서버, 빌드, 배포, 폰에 설치 |

## 명령어

```bash
npm install
npm run dev        # 개발 서버 (같은 Wi-Fi 의 폰에서도 접속 가능)
npm run check      # 규칙 시험, 스테이지 점검·시뮬레이션, 클리어 경로 재생
npm run build      # 점검 → 타입 검사 → 빌드
npm run deploy     # 빌드 후 gh-pages 브랜치로 배포
node scripts/solve-levels.mjs [번호...]   # 스테이지를 실제로 깰 수 있는지 탐색
```
