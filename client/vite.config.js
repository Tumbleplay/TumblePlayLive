import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(import.meta.dirname),
  plugins: [react()],
  resolve: { alias: { '@shared': path.resolve(import.meta.dirname, '../shared') } },
  server: {
    fs: { allow: ['..'] },
    proxy: { '/api': 'http://localhost:3000', '/socket.io': { target: 'ws://localhost:3000', ws: true } }
  },
  build: { outDir: 'dist', emptyOutDir: true }
});
