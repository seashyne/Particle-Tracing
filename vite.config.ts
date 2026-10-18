import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: 'demo',
  base: './',
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      'particle-tracing': path.resolve(__dirname, 'src/index.ts'),
    },
  },
});
