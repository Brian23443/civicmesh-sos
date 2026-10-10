import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { offlineInventory } from './scripts/offline-inventory';
import { MAX_PRECACHE_BYTES, PRECACHE_PATTERNS, PRECACHE_IGNORES } from './src/offline/config';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss(), offlineInventory(), VitePWA({
    registerType: 'autoUpdate', strategies: 'generateSW',
    includeAssets: ['icon.svg'],
    manifest: {
      name: 'CivicMesh-SOS', short_name: 'CivicMesh', description: 'Offline survivor emergency reporting',
      theme_color: '#101820', background_color: '#101820', display: 'standalone',
      start_url: './', scope: './',
      icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }],
    },
    workbox: { globPatterns: PRECACHE_PATTERNS,
      globIgnores: PRECACHE_IGNORES, maximumFileSizeToCacheInBytes: MAX_PRECACHE_BYTES,
      navigateFallback: 'index.html', cleanupOutdatedCaches: true },
  })],
  server: { port: 5173, strictPort: true }, preview: { port: 5173, strictPort: true },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], clearMocks: true },
});
