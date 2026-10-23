import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/socket.io': { target: 'http://127.0.0.1:3000', ws: true },
      '/health': { target: 'http://127.0.0.1:3000' }
    }
  },
  build: { outDir: 'dist', emptyOutDir: true }
});
