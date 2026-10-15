import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // Same-origin in dev so the hc client can use relative URLs (and SSE needs no CORS).
    proxy: { '/api': 'http://localhost:3001' },
  },
})
