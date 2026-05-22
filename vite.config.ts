import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      includeAssets: [
        'icons/icon.svg',
        'icons/favicon-16.png',
        'icons/favicon-32.png',
        'icons/apple-touch-icon.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-192-maskable.png',
        'icons/icon-512-maskable.png',
      ],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/order\//],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Keep jspdf out of the initial bundle — it only loads when the user
        // taps "Generate bill" on an order detail. Route-level lazy() in
        // App.tsx already isolates the OrderDetail chunk; this further
        // separates jspdf so it can be cached independently across route
        // upgrades. (T9.6 perf pass.)
        manualChunks: {
          jspdf: ['jspdf'],
        },
      },
    },
  },
});
