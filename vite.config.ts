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
    // Same-origin in dev, so neither the API client nor the socket needs CORS.
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': { target: 'ws://localhost:3001', ws: true },
    },
  },
})
