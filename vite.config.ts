import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    // `@/…` = web/src/…, as in create-vue projects. Mirrored in tsconfig.json `paths`.
    alias: { '@': fileURLToPath(new URL('./web/src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Same-origin in dev so the hc client can use relative URLs (and SSE needs no CORS).
    proxy: { '/api': 'http://localhost:3001' },
  },
})
