/**
 * 빌드 결과(dist)를 gh-pages 브랜치에 올려 GitHub Pages 에 배포한다.
 *
 *   npm run deploy
 *
 * 소스는 main 에, 배포본은 gh-pages 에 따로 둔다. main 의 커밋 이력이
 * 빌드 산출물로 지저분해지지 않는다.
 *
 * gh-pages 는 "지금 dist 의 모습" 하나만 있으면 되는 브랜치라 매번 커밋
 * 하나로 갈아치운다(--force). 되돌릴 이력이 필요하면 main 을 보면 된다.
 *
 * GitHub Actions 를 쓰지 않는 이유: 저장된 토큰에 workflow 스코프가 없어
 * .github/workflows 를 푸시할 수 없다. 스코프를 추가하면 워크플로 방식으로
 * 바꿀 수 있고, 그 파일은 .github/workflows/pages.yml 에 이미 써 두었다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const work = resolve(root, '.tmp/gh-pages');
const BRANCH = 'gh-pages';

const git = (args, cwd = root) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();

if (!existsSync(dist)) {
  console.error('dist 가 없습니다. 먼저 npm run build 를 실행하세요.');
  process.exit(1);
}

// 이전 실행이 남긴 워크트리 정리
git(['worktree', 'prune']);
rmSync(work, { recursive: true, force: true });

// gh-pages 를 이력 없는 고아 브랜치로 새로 준비한다
const exists = git(['branch', '--list', BRANCH]) !== '';
if (exists) git(['branch', '-D', BRANCH]);
git(['worktree', 'add', '--detach', work]);
git(['checkout', '--orphan', BRANCH], work);
git(['rm', '-rf', '--quiet', '.'], work);

// dist 내용을 통째로 복사 (숨김 파일 포함)
execFileSync('rsync', ['-a', `${dist}/`, `${work}/`]);

// Pages 는 _ 로 시작하는 경로를 Jekyll 로 처리하려 든다. 그걸 끈다.
execFileSync('touch', [resolve(work, '.nojekyll')]);

git(['add', '-A'], work);
git(['commit', '-q', '-m', 'deploy: dist'], work);

process.stdout.write('gh-pages 푸시 중...\n');
execFileSync('git', ['push', '--force', 'origin', BRANCH], {
  cwd: work,
  stdio: 'inherit',
});

// 워크트리는 배포용 임시 공간이라 끝나면 치운다
git(['worktree', 'remove', '--force', work]);

const url = git(['remote', 'get-url', 'origin'])
  .replace(/^https:\/\/(?:[^@]+@)?github\.com\//, '')
  .replace(/\.git$/, '');
const [owner, repo] = url.split('/');
console.log(`\n배포 완료 → https://${owner}.github.io/${repo}/`);
console.log('반영까지 30초~1분쯤 걸립니다.');
