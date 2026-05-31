import { defineConfig } from 'vitest/config'; // NOT 'vite' — re-exports Vite's defineConfig AND types the `test` key (else tsc fails)
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
const offline = process.env.BUILD_TARGET === 'offline';
export default defineConfig({
  base: './',
  define: { 'import.meta.env.BUILD_TARGET': JSON.stringify(process.env.BUILD_TARGET ?? 'web') },
  plugins: [react(), ...(offline ? [viteSingleFile()] : [])],
  build: {
    outDir: offline ? 'dist-offline' : 'dist',
    ...(offline ? { cssCodeSplit: false, assetsInlineLimit: 100_000_000 } : {}),
  },
  test: {
    globals: true,
    projects: [
      {
        // Browser/UI tests in jsdom (existing tests + src tests)
        test: {
          name: 'browser',
          environment: 'jsdom',
          pool: 'vmThreads',
          globals: true,
          include: [
            'src/**/*.test.ts',
            'src/**/*.test.tsx',
            'contracts/**/*.test.ts',
            'scripts/**/*.test.ts',
          ],
        },
      },
      {
        // Node-only tests for DuckDB integration
        test: {
          name: 'node',
          environment: 'node',
          pool: 'forks',
          globals: true,
          include: [
            'api/**/*.test.ts',
          ],
        },
      },
    ],
  },
});
