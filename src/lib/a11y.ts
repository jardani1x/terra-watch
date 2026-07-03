import type { KeyboardEvent } from 'react';

/** Spread onto a non-<button> element to make it a real keyboard-operable
 *  button: focusable and activated by Enter/Space, not just click. */
export function pressable(onActivate: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget) return; // inner controls keep their own keys
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
  };
}

/** True when the OS asks for reduced motion. CSS animations are disabled by
 *  the matching media query in index.css; map navigation jumps instead of
 *  flying (see MapCanvas). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
