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
  test: { environment: 'jsdom', globals: true, pool: 'vmThreads' },
});
