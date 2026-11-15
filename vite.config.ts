import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { cacheAsset, cacheNavigation, cacheRss } from './src/lib/pwa/cachePolicy.ts'

function stripUnusedOnnxWasmAssets(): Plugin {
  return {
    name: 'strip-unused-onnx-wasm-assets',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (/assets\/ort-wasm-.*\.wasm$/i.test(fileName)) {
          delete bundle[fileName]
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), tailwindcss(), cloudflare({
      viteEnvironment: { name: 'worker' },
      remoteBindings: Boolean(process.env.CLOUDFLARE_API_TOKEN),
    }),
    stripUnusedOnnxWasmAssets(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      injectRegister: false, // updates.ts owns registration and explicit user reload.
      manifest: false, // public/manifest.webmanifest is the single source of truth.
      outDir: 'dist/client',
      devOptions: { enabled: false },
      workbox: {
        globDirectory: 'dist/client',
        globPatterns: ['**/*.{js,css,html,woff,woff2,png,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        directoryIndex: null, // Let / and SPA navigations reach NetworkFirst, not precache aliases.
        navigateFallback: undefined,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        importScripts: ['/pwa-lifecycle.js'],
        runtimeCaching: [
          {
            urlPattern: cacheNavigation,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'rr-pages-v1', networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 20, maxAgeSeconds: 7 * 86400 },
              precacheFallback: { fallbackURL: '/index.html' },
            },
          },
          {
            urlPattern: cacheRss, method: 'GET', handler: 'NetworkFirst',
            options: {
              cacheName: 'rr-rss-v1', networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 30, maxAgeSeconds: 7 * 86400 },
            },
          },
          {
            urlPattern: cacheAsset, handler: 'CacheFirst',
            options: {
              cacheName: 'rr-assets-v1',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 86400 },
            },
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  worker: {
    format: 'es',
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 3000,
    allowedHosts: true,
  },
})
