import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built SPA works under the GitHub Pages project subpath
// (/terra-watch/) as well as at a domain root or in `vite preview`.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
  server: { port: 5173 },
});
