import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    /*
     * The point of this is a field with no signal. The plays were always kept
     * in localStorage, but the app itself needed a round trip to load, so with
     * no bars you got a blank page and a playbook you could not reach.
     */
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Chalk',
        short_name: 'Chalk',
        description: 'Pen-first play designer for 7-man youth tackle football.',
        theme_color: '#10161a',
        background_color: '#10161a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-256.png', sizes: '256x256', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,woff2}'],
        // pdf-lib and the firebase chunk both clear the 2MB default.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        // The stylus diagnostic is a real page, not a route into the app.
        navigateFallbackDenylist: [/^\/spen-test/],
      },
    }),
  ],
});
