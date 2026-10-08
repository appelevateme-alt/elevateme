// Production domain uses this root app. The evaluator API runs in Java.
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api/evaluation-access': { target: process.env.JAVA_API_URL || 'http://localhost:8080', changeOrigin: false } } },
})
