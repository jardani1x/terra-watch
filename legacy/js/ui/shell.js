// ============================================================
//  shell.js — dashboard chrome wiring (privacy + ticker)
//  Glues the non-globe shell controls: the privacy block (local-only notice,
//  the location→weather opt-in, "Clear local data"), and the bottom ticker
//  market segment. Everything globe/GPS related stays in app.js.
// ============================================================

import { persistenceEnabled } from '../util/storage.js';

/**
 * @param {Object} opts
 * @param {HTMLElement} opts.privacyState   text node for the storage notice
 * @param {HTMLInputElement} opts.weatherOptIn  checkbox: include my location in weather
 * @param {HTMLButtonElement} opts.clearBtn
 * @param {HTMLElement} opts.ticker         bottom market ticker host
 * @param {boolean} opts.ownWeatherInitial
 * @param {(enabled:boolean)=>void} opts.onOwnWeatherChange
 * @param {()=>void} opts.onClearData
 */
export function initShell({
  privacyState, weatherOptIn, clearBtn, ticker,
  ownWeatherInitial, onOwnWeatherChange, onClearData,
}) {
  // Privacy notice reflects whether anything is actually persisted on device.
  if (privacyState) {
    privacyState.textContent = persistenceEnabled()
      ? 'Location is processed on-device. Watchlist & trail are stored locally only — never uploaded.'
      : 'Local storage unavailable — nothing is persisted this session.';
  }

  if (weatherOptIn) {
    weatherOptIn.checked = !!ownWeatherInitial;
    weatherOptIn.addEventListener('change', () => onOwnWeatherChange(weatherOptIn.checked));
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear all locally stored Terra-Watch data (watchlist, movement trail, preferences)?')) {
        onClearData();
        clearBtn.textContent = '✓ LOCAL DATA CLEARED';
        setTimeout(() => { clearBtn.textContent = '⌦ CLEAR LOCAL DATA'; }, 1800);
      }
    });
  }

  /** Update the bottom ticker market segment with a short rotating summary. */
  function setTicker(items) {
    if (!ticker) return;
    if (!items || !items.length) { ticker.innerHTML = ''; return; }
    ticker.innerHTML = items.map((it) =>
      `<span class="tk-item"><b>${it.label}</b> ${it.value} <i class="${it.sign}">${it.change}</i></span>`
    ).join('<span class="tk-sep">·</span>');
  }

  return { setTicker };
}
