import { defineConfig } from 'vite';

export default defineConfig({
  // 상대 경로로 빌드해야 파일 직접 열기 / 하위 경로 호스팅 모두 동작한다
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 1024 * 1024, // 아이콘 정도는 인라인해 요청 수를 줄인다
    rollupOptions: {
      output: {
        // 단일 HTML 인라인 스크립트가 쉽도록 청크를 쪼개지 않는다
        manualChunks: undefined,
        inlineDynamicImports: true,
      },
    },
  },
});
