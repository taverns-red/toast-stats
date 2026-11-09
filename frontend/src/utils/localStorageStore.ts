/* Versioned localStorage primitive (#420). All persistence — favorites,
   filters, last-visited, my-district pin — goes through this module so
   schema migrations stay tractable. Bump STORAGE_VERSION whenever the
   shape of any stored value changes incompatibly. Which store it lands in is
   preferenceStorage's call, from the visitor's consent (#2584). */

import {
  readPreference,
  removePreference,
  writePreference,
} from './preferenceStorage'

export const STORAGE_VERSION = 1
const PREFIX = 'toast-stats'

export function storageKey(name: string): string {
  return `${PREFIX}:v${STORAGE_VERSION}:${name}`
}

export function readJson<T>(name: string, fallback: T): T {
  try {
    const raw = readPreference(storageKey(name))
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJson(name: string, value: unknown): boolean {
  try {
    return writePreference(storageKey(name), JSON.stringify(value))
  } catch {
    return false
  }
}

export function removeKey(name: string): void {
  removePreference(storageKey(name))
}
