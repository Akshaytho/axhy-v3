/**
 * Locale store and hook for the supervisor mobile app.
 *
 * ## Architecture
 *
 * We need locale changes (written in `profile.tsx`) to re-render the tab
 * layout and all screen titles without a full app reload. React's built-in
 * `useSyncExternalStore` is exactly the right primitive: it subscribes to an
 * external store (our module-level locale variable) and triggers a re-render
 * when the store changes.
 *
 * The store has two update paths:
 *   1. In-process: `setLocale()` sets the module variable directly — instant,
 *      no round-trip through the DOM storage event cycle.
 *   2. Cross-tab (web only): the `window 'storage'` event listener catches
 *      writes from other tabs and keeps them in sync.
 *
 * On React Native the `window 'storage'` event does not fire, but path 1
 * (in-process) is the only path that matters there.
 *
 * Platform handling:
 *   - `localStorage` reads/writes are guarded behind `typeof localStorage`
 *     so the module is safe to import in SSR or Jest environments.
 *   - On React Native we default to 'en'. Persistent locale storage for
 *     native is a follow-up (expo-secure-store or AsyncStorage).
 *
 * @derives(master-plan §G) — supervisor surface
 * @derives(ADR-0003)
 */

import { useSyncExternalStore } from 'react';

import { LOCALE_STORAGE_KEY, getStrings, type LocaleCode, type LocaleStrings } from './strings';

// ─── Module-level store ───────────────────────────────────────────────────────

/** Set of listener callbacks registered by `useSyncExternalStore`. */
const listeners = new Set<() => void>();

/**
 * Reads the current locale from localStorage, falling back to 'en'.
 * Safe to call in any environment.
 */
function readStoredLocale(): LocaleCode {
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw === 'hi' || raw === 'te') return raw;
  }
  return 'en';
}

/** Module-level snapshot — initialised once, updated by `setLocale`. */
let currentLocale: LocaleCode = readStoredLocale();

/** Notify all subscribers that the locale has changed. */
function notifyListeners(): void {
  for (const cb of listeners) {
    cb();
  }
}

// ─── Cross-tab sync (web only) ────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === LOCALE_STORAGE_KEY) {
      const next = e.newValue;
      const nextLocale: LocaleCode = next === 'hi' || next === 'te' ? next : 'en';
      if (nextLocale !== currentLocale) {
        currentLocale = nextLocale;
        notifyListeners();
      }
    }
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Sets the app locale, persists it to localStorage, and synchronously
 * re-renders all subscribers.
 *
 * Call this from the Profile language picker instead of writing to
 * localStorage directly — it ensures the in-process store is also updated
 * (the DOM `storage` event does NOT fire for writes from the same tab).
 */
export function setLocale(code: LocaleCode): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LOCALE_STORAGE_KEY, code);
  }
  if (code !== currentLocale) {
    currentLocale = code;
    notifyListeners();
  }
}

/** Returns the currently stored locale code without subscribing. */
export function getLocale(): LocaleCode {
  return currentLocale;
}

// ─── useSyncExternalStore wiring ─────────────────────────────────────────────

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): LocaleCode {
  return currentLocale;
}

// Server snapshot always returns 'en' to avoid hydration mismatches.
function getServerSnapshot(): LocaleCode {
  return 'en';
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * React hook that returns the locale string map for the current locale.
 *
 * Re-renders automatically whenever `setLocale()` is called — no manual
 * event listeners or useEffect needed.
 *
 * Usage:
 * ```tsx
 * const strings = useLocaleStrings();
 * <Text>{strings.today.title}</Text>
 * ```
 */
export function useLocaleStrings(): LocaleStrings {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return getStrings(locale);
}

/**
 * React hook that returns the raw locale code ('en' | 'hi' | 'te').
 *
 * Useful when a component needs the code itself (e.g. to pass to Intl APIs)
 * rather than the full strings map.
 */
export function useLocaleCode(): LocaleCode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
