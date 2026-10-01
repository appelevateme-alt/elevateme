import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Same-origin /api proxy for guest cookies (dev):
// /api -> Java http://localhost:8080. SPA fallback applies AFTER /api
// (Vite dev fallback rewrites unknown non-/api paths to index.html;
//  proxied /api requests are forwarded, never fallen back).
export default defineConfig({
  plugins: [react()],
  appType: 'spa',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
});
