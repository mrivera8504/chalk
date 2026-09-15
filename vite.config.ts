import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Which build this is, baked in at compile time.
 *
 * A service worker means two devices can be running two different bundles at
 * the same moment, and the app had no way to say which — answering "is this
 * phone on the new code?" once took an MD5 of the deployed asset against a
 * local build. Netlify sets COMMIT_REF; git answers on this machine; a checkout
 * with neither is honest about it rather than guessing.
 */
function buildId(): string {
  const sha =
    process.env.COMMIT_REF?.slice(0, 7) ??
    (() => {
      try {
        return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
          .toString()
          .trim();
      } catch {
        return 'nogit';
      }
    })();
  return `${sha} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
}

export default defineConfig({
  define: {
    __BUILD__: JSON.stringify(buildId()),
  },
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
