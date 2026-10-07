import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Local dev: `vercel dev` serves /api. Plain `vite` has no /api,
  // and the frontend auto-falls back to the offline local store.
})
