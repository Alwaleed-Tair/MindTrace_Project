import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

// Dev: `npm run dev` serves the UI on :3000 and forwards /api to the backend on :8000 (same origin, so the login cookie just works).
// Production: `npm run build`, then the backend serves frontend/dist itself.
const backend = process.env.VITE_BACKEND_URL ?? 'http://localhost:8000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') }, dedupe: ['react', 'react-dom'] },
  server: { port: 3000, strictPort: true, host: '0.0.0.0', proxy: { '/api': { target: backend, changeOrigin: false } } },
  preview: { port: 3000, host: '0.0.0.0', proxy: { '/api': { target: backend, changeOrigin: false } } },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'], css: false, include: ['src/**/*.test.{ts,tsx}'] },
});
