import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist/main',
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      },
      {
        entry: 'src/main/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist/main',
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      }
    ])
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@hengsch/shared-types': path.resolve(__dirname, '../packages/shared-types/src/index.ts'),
      '@hengsch/shared-logic': path.resolve(__dirname, '../packages/shared-logic/src/index.ts'),
      '@hengsch/shared-storage': path.resolve(__dirname, '../packages/shared-storage/src/index.ts')
    }
  },
  server: {
    port: 5175
  }
});