import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg'],
      manifest: {
        name: 'HengSch Todo',
        short_name: 'HengSch',
        description: '功能完整的待办事项管理软件（Web版）',
        theme_color: '#e8eaed',
        background_color: '#f0f0f0',
        display: 'standalone',
        start_url: '/'
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
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
    port: 5174
  }
});
