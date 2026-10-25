/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative base so the built app works from any static host sub-path.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        // Stable identity so a reinstall/update is recognised as the same app.
        id: './',
        name: 'Sleeper Companion',
        short_name: 'Companion',
        description: 'Personal, read-only companion for your Sleeper fantasy leagues.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the app shell is precached. Sleeper API responses are NOT cached by the
        // service worker; the app manages its own data caching so timestamps stay honest.
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: 'index.html',
        // Published value snapshots: try the network first, fall back to the last copy offline.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/fantasycalc/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'fantasycalc-values', expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
