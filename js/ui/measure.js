// ============================================================
//  measure.js — great-circle measure tool (workspace + mode controller)
//  Owns the Measure panel's CONTENT and the measure-MODE state. It holds the
//  ordered list of dropped vertices, computes per-segment + total great-circle
//  distance (haversineKm) and initial bearing, and renders the readout. It does
//  NOT touch the Three.js scene or Leaflet — app.js subscribes via onChange and
//  draws the equivalent geometry (globe polyline + street polyline) itself.
//
//  Selection-bus / inspector are untouched: measure is a standalone overlay.
// ============================================================
import { haversineKm, fmtKm, initialBearing } from '../util/distance.js';

/**
 * @param {Object} opts
 * @param {HTMLButtonElement} opts.toggleBtn  arms / disarms measure mode
 * @param {HTMLButtonElement} opts.clearBtn   wipes all vertices
 * @param {HTMLElement}       opts.readout     host for the segment/total list
 * @param {(verts:{lon:number,lat:number}[])=>void} [opts.onChange]     vertices changed → redraw
 * @param {(active:boolean)=>void}                  [opts.onActiveChange] mode armed/disarmed
 */
export function initMeasure({ toggleBtn, clearBtn, readout, onChange, onActiveChange }) {
  /** @type {{lon:number,lat:number}[]} */
  let verts = [];
  let active = false;

  function render() {
    if (toggleBtn) {
      toggleBtn.classList.toggle('active', active);
      toggleBtn.setAttribute('aria-pressed', String(active));
      toggleBtn.textContent = active ? '■ MEASURING — CLICK GLOBE' : '⟟ START MEASURING';
    }
    if (!readout) return;

    if (verts.length === 0) {
      readout.innerHTML = `<p class="ws-empty">${active
        ? 'Click points on the globe to drop vertices.<br><span>Great-circle distance + bearing accrue per leg.</span>'
        : 'Arm measure mode, then click the globe to drop vertices.'}</p>`;
      return;
    }

    let total = 0;
    const rows = [];
    for (let i = 1; i < verts.length; i++) {
      const a = verts[i - 1], b = verts[i];
      const km = haversineKm(a.lon, a.lat, b.lon, b.lat);
      const brg = initialBearing(a.lon, a.lat, b.lon, b.lat);
      total += km;
      rows.push(
        `<div class="ms-row"><span class="ms-leg">LEG ${i}</span>` +
        `<span class="ms-d">${fmtKm(km)}</span>` +
        `<span class="ms-b">${brg.toFixed(0).padStart(3, '0')}°</span></div>`
      );
    }
    const last = verts[verts.length - 1];
    rows.push(
      `<div class="ms-row ms-total"><span class="ms-leg">TOTAL</span>` +
      `<span class="ms-d">${fmtKm(total)}</span>` +
      `<span class="ms-b">${verts.length} pts</span></div>`
    );
    rows.push(
      `<div class="ms-last">last: ${last.lat.toFixed(4)}, ${last.lon.toFixed(4)}</div>`
    );
    readout.innerHTML = rows.join('');
  }

  function setActive(on) {
    active = !!on;
    onActiveChange?.(active);
    render();
  }

  function addVertex(lon, lat) {
    if (!active) return;
    verts.push({ lon, lat });
    onChange?.(verts);
    render();
  }

  function clear() {
    verts = [];
    onChange?.(verts);
    render();
  }

  toggleBtn?.addEventListener('click', () => setActive(!active));
  clearBtn?.addEventListener('click', clear);

  render();

  return {
    isActive: () => active,
    setActive,
    addVertex,
    clear,
    vertices: () => verts.slice(),
  };
}
