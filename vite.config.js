import path from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: 'web',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'web/src'),
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.js'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    pool: 'threads',
    teardownTimeout: 2000,
  },
});
