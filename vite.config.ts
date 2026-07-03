import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built SPA works under the GitHub Pages project subpath
// (/terra-watch/) as well as at a domain root or in `vite preview`.
export default defineConfig({
  base: './',
  plugins: [react()],
  // MapCanvas is lazy-loaded (React.lazy), so maplibre-gl lands in its own
  // async chunk (~800 kB minified — a single vendor lib, hence the raised
  // warning limit) and the app shell chunk stays small.
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
  server: { port: 5173 },
});
