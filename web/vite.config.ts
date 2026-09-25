import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { quizApi } from './quiz-store.mjs';

export default defineConfig({
  preview: {
    allowedHosts: ['quiz.doxstation.com'],
  },
  plugins: [
    {
      name: 'shared-quizzes',
      configureServer(server) {
        server.middlewares.use(quizApi);
      },
      configurePreviewServer(server) {
        server.middlewares.use(quizApi);
      },
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Ignite Quiz',
        short_name: 'Ignite Quiz',
        description: 'Practice your React knowledge with short quizzes.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#202024',
        theme_color: '#202024',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
});
