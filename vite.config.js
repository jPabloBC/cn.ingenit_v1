import { defineConfig } from 'vite';

export default defineConfig({
  root: './ui',
  build: {
    outDir: '../ui/dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
