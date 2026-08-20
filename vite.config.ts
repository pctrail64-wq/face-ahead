import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base is set at build time so the same code works on GitHub Pages
// (served from /<repo>/) and on any root-domain host.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',
  build: { outDir: 'dist', chunkSizeWarningLimit: 1600 },
  server: {
    host: '0.0.0.0',
    port: 5190,
    strictPort: true,
    allowedHosts: true,
    cors: true,
    hmr: { clientPort: 443 },
  },
  preview: { host: '0.0.0.0', port: 5190, strictPort: true, allowedHosts: true },
})
