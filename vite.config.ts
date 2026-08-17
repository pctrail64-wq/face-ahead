import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deploy base path: GitHub Pages → VITE_BASE_PATH=/future-face/ (workflow sets it)
const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  plugins: [react()],
  base,
  server: { port: 5374, host: '0.0.0.0', allowedHosts: true },
  test: { include: ['src/**/*.test.ts'] },
});
