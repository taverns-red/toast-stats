/* The one place saved preferences touch browser storage (#2584).

   - all / minimal: localStorage, so they survive the tab.
   - none, or no choice made yet: sessionStorage, so they last for the tab
     session only and nothing is saved on the device.
   Reads also accept what an earlier visit saved to localStorage before a
   choice is made (so a returning visitor's theme does not flicker), but never
   under "none".

   The consent cookie itself is not a preference and lives in utils/consent.
   Every access is try/catch-wrapped: blocked storage must not blank the app
   (#1646, storageAccess.guard.test.ts). */

import { getConsent } from './consent'

/** Keys the site saves under localStorage, beyond the `toast-stats:` prefix. */
const UNPREFIXED_KEYS = ['theme', 'toast-stats-error-telemetry']

function persistent(): boolean {
  const level = getConsent()
  return level === 'all' || level === 'minimal'
}

export function readPreference(key: string): string | null {
  try {
    const session = window.sessionStorage.getItem(key)
    if (session !== null) return session
  } catch {
    // sessionStorage unavailable
  }
  if (getConsent() === 'none') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writePreference(key: string, value: string): boolean {
  try {
    if (persistent()) {
      window.localStorage.setItem(key, value)
      window.sessionStorage.removeItem(key)
    } else {
      window.sessionStorage.setItem(key, value)
    }
    return true
  } catch {
    return false
  }
}

export function removePreference(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/** Moving to "none": keep this tab's current preferences for the session,
 *  and take everything off the device. */
export function removeAllSavedPreferencesToSession(): void {
  try {
    const ls = window.localStorage
    const keys: string[] = []
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i)
      if (k && (k.startsWith('toast-stats:') || UNPREFIXED_KEYS.includes(k))) {
        keys.push(k)
      }
    }
    for (const k of keys) {
      const v = ls.getItem(k)
      if (v !== null) {
        try {
          window.sessionStorage.setItem(k, v)
        } catch {
          // sessionStorage unavailable: the value is simply dropped
        }
      }
      ls.removeItem(k)
    }
  } catch {
    // localStorage unavailable: nothing saved to remove
  }
}
