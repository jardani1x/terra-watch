import { Cartesian3, Math as CesiumMath, SceneMode, type Viewer } from 'cesium';
import { prefersReducedMotion } from '../a11y';
import { heightForZoom } from './viewer';

/** Idle spin for the 3D globe: the camera longitude falls at the Earth's true
 *  sidereal rate (one revolution per 23 h 56 m 4 s ≈ 0.004178 °/s), so the
 *  surface drifts west→east exactly as fast as the real planet turns —
 *  deliberately subtle, realism over theatrics. Runs on the viewer clock's
 *  onTick (fires every frame even in requestRenderMode) and requests a render
 *  after each rotation. Any pointer/wheel/touch input on the canvas ends the
 *  spin until the next 3D entry — manual control always wins. Skipped
 *  entirely under prefers-reduced-motion. */
const SPIN_RAD_PER_SEC = (2 * Math.PI) / 86164; // sidereal day = 86 164 s
const SPIN_MIN_HEIGHT = heightForZoom(5); // spinning a zoomed-in view is disorienting

export function startGlobeSpin(viewer: Viewer): () => void {
  if (prefersReducedMotion()) return () => {};
  let stopped = false;
  let last: number | null = null;
  let logStep = 0; // ticks are per-frame; log every ~600th (~10 s) to keep the console quiet
  const canvas = viewer.scene.canvas;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    removeTick();
    canvas.removeEventListener('pointerdown', stop);
    canvas.removeEventListener('wheel', stop);
    canvas.removeEventListener('touchstart', stop);
  };

  const tick = () => {
    if (stopped) return;
    if (viewer.isDestroyed()) { stop(); return; }
    const now = performance.now();
    const dt = last == null ? 0 : (now - last) / 1000;
    last = now;
    if (dt <= 0 || dt > 5) return; // first tick / woken tab — no catch-up jumps
    const scene = viewer.scene;
    if (scene.mode !== SceneMode.SCENE3D) return;
    const carto = viewer.camera.positionCartographic;
    if (!carto || carto.height < SPIN_MIN_HEIGHT) return; // resumes if the camera pulls back out
    // negative angle: camera longitude falls (drifts west), so the surface
    // below appears to turn eastward like the real Earth
    viewer.camera.rotate(Cartesian3.UNIT_Z, -SPIN_RAD_PER_SEC * dt);
    if (logStep++ % 600 === 0) {
      const lon = CesiumMath.toDegrees(viewer.camera.positionCartographic.longitude);
      console.log(`[globe-spin] camera lon ${lon.toFixed(4)} (sidereal ${((SPIN_RAD_PER_SEC * 180) / Math.PI).toFixed(6)} deg/s)`);
    }
    scene.requestRender();
  };

  const removeTick = viewer.clock.onTick.addEventListener(tick);
  canvas.addEventListener('pointerdown', stop);
  canvas.addEventListener('wheel', stop);
  canvas.addEventListener('touchstart', stop);
  return stop;
}
