import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'url'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Self-destroying: this app needs network anyway (camera upload, gallery,
      // slideshow polling), so app-shell precaching buys nothing and causes guests
      // to be served stale JS after deploys. selfDestroying ships a service worker
      // that unregisters itself and clears caches on every client that had the old
      // PWA installed — so everyone gets current code on every load.
      selfDestroying: true,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Reverie',
        short_name: 'Reverie',
        description: 'A premium digital disposable camera for weddings',
        theme_color: '#1a1612',
        background_color: '#1a1612',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  }
})
