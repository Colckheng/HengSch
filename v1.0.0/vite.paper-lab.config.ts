import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Deliberately no Electron plugin: this preview never boots the real app/store.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5186, strictPort: true },
  build: {
    outDir: 'dist-paper-lab',
    rollupOptions: { input: path.resolve(__dirname, 'paper-lab.html') }
  }
});
