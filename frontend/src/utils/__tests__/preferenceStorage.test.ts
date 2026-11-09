import { beforeEach, describe, expect, it } from 'vitest'
import { CONSENT_COOKIE, setConsent } from '../consent'
import {
  readPreference,
  removePreference,
  writePreference,
} from '../preferenceStorage'
import { readJson, storageKey, writeJson } from '../localStorageStore'

/* One storage helper for saved preferences (#2584). With "none" (and before
   any choice) they last for the tab session only. */

describe('preferenceStorage (#2584)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`
  })

  it.each(['all', 'minimal'] as const)('%s persists to localStorage', level => {
    setConsent(level)
    writePreference('theme', 'dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(sessionStorage.getItem('theme')).toBeNull()
    expect(readPreference('theme')).toBe('dark')
  })

  it('none keeps preferences in sessionStorage only', () => {
    setConsent('none')
    writePreference('theme', 'dark')
    expect(sessionStorage.getItem('theme')).toBe('dark')
    expect(localStorage.getItem('theme')).toBeNull()
    expect(readPreference('theme')).toBe('dark')
  })

  it('writes nothing to localStorage before a choice is made', () => {
    writePreference('theme', 'dark')
    expect(localStorage.getItem('theme')).toBeNull()
    expect(sessionStorage.getItem('theme')).toBe('dark')
  })

  it('still reads a preference saved by an earlier visit before a choice', () => {
    localStorage.setItem('theme', 'light')
    expect(readPreference('theme')).toBe('light')
  })

  it('does not read old localStorage preferences under none', () => {
    setConsent('none')
    localStorage.setItem('theme', 'light')
    expect(readPreference('theme')).toBeNull()
  })

  it('removePreference clears both stores', () => {
    setConsent('minimal')
    writePreference('theme', 'dark')
    sessionStorage.setItem('theme', 'dark')
    removePreference('theme')
    expect(readPreference('theme')).toBeNull()
    expect(sessionStorage.getItem('theme')).toBeNull()
  })

  it('the versioned primitive goes through it', () => {
    setConsent('none')
    writeJson('filters', { a: 1 })
    expect(readJson('filters', null)).toEqual({ a: 1 })
    expect(localStorage.getItem(storageKey('filters'))).toBeNull()
  })
})
