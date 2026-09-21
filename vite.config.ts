import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages(https://<user>.github.io/<repo>/)向けにはサブパスで配信する
const base = process.env.GITHUB_ACTIONS ? '/nikki-calendar/' : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: '日記カレンダー',
        short_name: '日記',
        description: 'Google カレンダーと連携した日記・手書きメモ',
        lang: 'ja',
        theme_color: '#1a73e8',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Google API への通信はキャッシュしない
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  server: { port: 5173 },
});
