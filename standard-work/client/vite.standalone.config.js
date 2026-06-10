// Builds the no-install single-file version: one self-contained HTML file
// (data in IndexedDB) for machines where Node.js can't be installed.
// Output: ../standalone/StandardWork.html
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
        const src = path.resolve(__dirname, 'dist-standalone/index.html');
        const dest = path.resolve(__dirname, '../standalone/StandardWork.html');
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        console.log(`Standalone app written to ${dest}`);
      },
    },
  ],
  resolve: {
    alias: { '@backend': path.resolve(__dirname, 'src/localApi.js') },
  },
  build: {
    outDir: 'dist-standalone',
    chunkSizeWarningLimit: 5000,
  },
});
