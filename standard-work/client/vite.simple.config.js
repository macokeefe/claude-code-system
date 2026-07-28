// Builds "Standard Work — Simplified": a single self-contained HTML file with a
// stripped-down, one-screen UI (data in IndexedDB, same as the full standalone).
// Output: ../standalone/StandardWorkSimplified.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    viteSingleFile(),
    {
      name: 'rename-output',
      closeBundle() {
        const src = path.resolve(__dirname, 'dist-simple/index-simple.html');
        const dest = path.resolve(__dirname, '../standalone/StandardWorkSimplified.html');
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        console.log(`Simplified app written to ${dest}`);
      },
    },
  ],
  resolve: {
    alias: { '@backend': path.resolve(__dirname, 'src/localApi.js') },
  },
  build: {
    outDir: 'dist-simple',
    chunkSizeWarningLimit: 5000,
    rollupOptions: { input: path.resolve(__dirname, 'index-simple.html') },
  },
});
