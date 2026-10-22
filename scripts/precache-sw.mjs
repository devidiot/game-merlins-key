/**
 * 빌드 뒤 dist/sw.js 에 실제 산출물 목록을 박아 넣는다.
 *
 * Vite 가 파일명에 해시를 붙이므로 서비스 워커가 목록을 미리 알 수 없다.
 * 빌드가 끝난 뒤 dist 를 훑어 그대로 적어주면, 서비스 워커가 설치되는 순간
 * 게임 전체를 받아둔다 → 첫 실행 한 번이면 오프라인 준비 완료.
 *
 * 캐시 이름에도 파일 목록의 해시를 넣어, 새로 배포하면 옛 캐시가 자동으로
 * 버려지고 새 파일을 받게 한다.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const dist = resolve(process.cwd(), 'dist');
const swPath = join(dist, 'sw.js');

/** dist 안의 모든 파일을 './...' 형태의 상대 경로로 모은다 */
function collect(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...collect(full));
    } else {
      out.push('./' + relative(dist, full).split('\\').join('/'));
    }
  }
  return out;
}

// 서비스 워커 자신은 브라우저가 따로 관리하므로 목록에서 뺀다
const files = collect(dist)
  .filter((f) => f !== './sw.js')
  .sort();

const version = createHash('sha1').update(files.join('|')).digest('hex').slice(0, 8);

const source = readFileSync(swPath, 'utf8');
const patched = source
  .replace(/const CACHE = '[^']*';/, `const CACHE = 'merlins-key-${version}';`)
  .replace(
    /const PRECACHE = \[[^\]]*\];/,
    `const PRECACHE = [\n  ${files.map((f) => `'${f}'`).join(',\n  ')},\n];`,
  );

if (patched === source) {
  console.error('sw.js 에서 CACHE/PRECACHE 자리를 찾지 못했습니다.');
  process.exit(1);
}

writeFileSync(swPath, patched);

const bytes = files.reduce((sum, f) => sum + statSync(join(dist, f)).size, 0);
console.log(
  `sw.js 프리캐시 ${files.length}개 파일 / ${(bytes / 1024).toFixed(0)} KB (merlins-key-${version})`,
);
