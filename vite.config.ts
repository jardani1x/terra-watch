import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

// Relative base so the built SPA works under the GitHub Pages project subpath
// (/terra-watch/) as well as at a domain root or in `vite preview`.
export default defineConfig({
  base: './',
  // vite-plugin-cesium copies Cesium's static assets (workers, textures,
  // the star-map skybox) into dist/ and wires CESIUM_BASE_URL for them.
  plugins: [react(), cesium()],
  // CesiumCanvas is lazy-loaded (React.lazy), so cesium lands in its own
  // async chunk (several MB — a single vendor lib, hence the raised warning
  // limit) and the app shell chunk stays small.
  // sgp4.worker.ts pulls in satellite.js's wasm build, which uses top-level
  // await internally. The default worker output format ('iife') can't emit
  // that at all, and the default esbuild target (safari14 etc.) predates
  // top-level-await support even for 'es' output — so both the worker format
  // and the build target need bumping for that one chunk to transpile.
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 4600, target: 'es2022' },
  // legacy/ (the preserved v1 site) imports three/cytoscape which are no
  // longer installed — keep Vite's dependency scan on the real app entry only
  optimizeDeps: { entries: ['index.html'] },
  worker: { format: 'es' },
  server: { port: 5173 },
});
