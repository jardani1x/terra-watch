import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built SPA works under the GitHub Pages project subpath
// (/terra-watch/) as well as at a domain root or in `vite preview`.
export default defineConfig({
  base: './',
  plugins: [react()],
  // MapCanvas is lazy-loaded (React.lazy), so maplibre-gl lands in its own
  // async chunk (~1.06 MB minified since v5 / globe support — a single vendor
  // lib, hence the raised warning limit) and the app shell chunk stays small.
  // sgp4.worker.ts pulls in satellite.js's wasm build, which uses top-level
  // await internally. The default worker output format ('iife') can't emit
  // that at all, and the default esbuild target (safari14 etc.) predates
  // top-level-await support even for 'es' output — so both the worker format
  // and the build target need bumping for that one chunk to transpile.
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1100, target: 'es2022' },
  worker: { format: 'es' },
  server: { port: 5173 },
});
