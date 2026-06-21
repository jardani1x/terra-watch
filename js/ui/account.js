// ============================================================
//  account.js — sign-in / account chip for the Tracking workspace
//  Renders one of three states into a host element:
//    • cloud sync off  → a muted note ("keys stored locally")  [Supabase unconfigured]
//    • signed out      → "Sign in with Google" button
//    • signed in       → user email chip + "Sign out" button
//  It owns NO auth state: the app calls render(user, configured) on every auth
//  change, and the click handlers delegate to onSignIn / onSignOut. Civilian SA.
// ============================================================

/**
 * @param {Object} opts
 * @param {HTMLElement} opts.host
 * @param {()=>void} opts.onSignIn
 * @param {()=>void} opts.onSignOut
 * @returns {{ render:(user:Object|null, configured:boolean)=>void }}
 */
export function initAccount({ host, onSignIn, onSignOut }) {
  function render(user, configured) {
    host.innerHTML = '';

    if (!configured) {
      const note = document.createElement('p');
      note.className = 'track-account-note';
      note.textContent = 'Cloud sync off — keys stored locally on this device.';
      host.appendChild(note);
      return;
    }

    if (!user) {
      const btn = document.createElement('button');
      btn.className = 'rail-btn track-signin';
      btn.type = 'button';
      btn.innerHTML = '<span class="g-mark" aria-hidden="true">G</span> Sign in with Google';
      btn.addEventListener('click', () => onSignIn?.());
      host.appendChild(btn);

      const note = document.createElement('p');
      note.className = 'track-account-note';
      note.textContent = 'Sign in to sync your tracking keys across devices.';
      host.appendChild(note);
      return;
    }

    const chip = document.createElement('span');
    chip.className = 'track-user-chip';
    chip.title = user.email || 'Signed in';
    chip.textContent = user.email || 'Signed in';
    host.appendChild(chip);

    const out = document.createElement('button');
    out.className = 'rail-btn danger track-signout';
    out.type = 'button';
    out.textContent = 'Sign out';
    out.addEventListener('click', () => onSignOut?.());
    host.appendChild(out);
  }

  return { render };
}
