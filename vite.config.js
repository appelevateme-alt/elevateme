// DEPRECATED root entry: serves legacy src/main.jsx only. Revamp lives in frontend/
// per docs/REVMAP.md migration plan. Kept building for reference — do not add features here.
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
