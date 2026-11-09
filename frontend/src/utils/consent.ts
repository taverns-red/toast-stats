/* Cookie and analytics consent store (#2584).

   One choice, three levels:
   - all:     Google Analytics plus the site's saved preferences.
   - minimal: saved preferences only. Google Analytics never loads.
   - none:    neither. Preferences last for the tab session only.

   The choice itself is one first-party cookie, `rt_consent`, because it is
   strictly necessary (without it the banner returns on every page). It is
   scoped to `.taverns.red` so the portal, Toast Stats and Red Table share
   it and a visitor answers once (ops#319). Value: `v<version>.<level>`.
   Bump CONSENT_VERSION to ask everyone again after a policy change; the
   inline GA gate in index.html reads the same cookie and version.

   Nothing non-essential happens before a choice (opt-in). */

import { removeAllSavedPreferencesToSession } from './preferenceStorage'

export type ConsentLevel = 'all' | 'minimal' | 'none'

export const CONSENT_COOKIE = 'rt_consent'
export const CONSENT_VERSION = 1
const MAX_AGE_SECONDS = 31_536_000 // ~12 months
const SHARED_DOMAIN = '.taverns.red'

const LEVELS: readonly ConsentLevel[] = ['all', 'minimal', 'none']

export interface ConsentState {
  level: ConsentLevel | null
  settingsOpen: boolean
}

interface GaHook {
  enable: () => void
  disable: () => void
}

function onSharedDomain(hostname: string): boolean {
  return hostname === 'taverns.red' || hostname.endsWith('.taverns.red')
}

/** The Set-Cookie string for a choice. Pure, so both host paths are testable. */
export function buildConsentCookie(
  level: ConsentLevel,
  hostname: string,
  protocol: string
): string {
  const parts = [
    `${CONSENT_COOKIE}=v${CONSENT_VERSION}.${level}`,
    'Path=/',
    `Max-Age=${MAX_AGE_SECONDS}`,
    'SameSite=Lax',
  ]
  // localhost and preview hosts cannot set .taverns.red: host-only there.
  if (onSharedDomain(hostname)) parts.push(`Domain=${SHARED_DOMAIN}`)
  if (protocol === 'https:') parts.push('Secure')
  return parts.join('; ')
}

/** Expiring Set-Cookie strings for every `_ga*` cookie, on every scope GA
 *  may have used: host-only, the host, and `.taverns.red`. */
export function gaCookieExpiries(names: string[], hostname: string): string[] {
  const domains = [null, hostname]
  if (onSharedDomain(hostname)) domains.push(SHARED_DOMAIN)
  return names
    .filter(n => n === '_ga' || n.startsWith('_ga_'))
    .flatMap(n =>
      domains.map(
        d => `${n}=; Max-Age=0; Path=/${d === null ? '' : `; Domain=${d}`}`
      )
    )
}

function readCookie(name: string): string | null {
  try {
    for (const part of document.cookie.split(';')) {
      const i = part.indexOf('=')
      if (i !== -1 && part.slice(0, i).trim() === name) {
        return part.slice(i + 1).trim()
      }
    }
  } catch {
    // cookies unavailable
  }
  return null
}

/** The stored choice, or null when undecided, unreadable or out of date. */
export function getConsent(): ConsentLevel | null {
  const raw = readCookie(CONSENT_COOKIE)
  const m = raw ? /^v(\d+)\.(\w+)$/.exec(raw) : null
  if (!m || Number(m[1]) !== CONSENT_VERSION) return null
  return (LEVELS as readonly string[]).includes(m[2] ?? '')
    ? (m[2] as ConsentLevel)
    : null
}

let state: ConsentState = { level: getConsent(), settingsOpen: false }
const listeners = new Set<() => void>()

function publish(next: ConsentState): void {
  state = next
  listeners.forEach(l => l())
}

export function getConsentState(): ConsentState {
  // Re-read the cookie: another tab or subdomain may have changed it.
  const level = getConsent()
  if (level !== state.level) state = { ...state, level }
  return state
}

export function subscribeConsent(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function openConsentSettings(): void {
  publish({ ...getConsentState(), settingsOpen: true })
}

export function closeConsentSettings(): void {
  publish({ ...getConsentState(), settingsOpen: false })
}

function gaHook(): GaHook | undefined {
  return (window as unknown as { __tsGa?: GaHook }).__tsGa
}

function clearGaCookies(): void {
  try {
    const names = document.cookie
      .split(';')
      .map(p => p.split('=')[0]?.trim() ?? '')
    for (const c of gaCookieExpiries(names, window.location.hostname)) {
      document.cookie = c
    }
  } catch {
    // cookies unavailable
  }
}

/** Record a choice and apply it at once. */
export function setConsent(level: ConsentLevel): void {
  try {
    document.cookie = buildConsentCookie(
      level,
      window.location.hostname,
      window.location.protocol
    )
  } catch {
    // cookies blocked: the choice applies to this page view only
  }
  if (level === 'all') {
    gaHook()?.enable()
  } else {
    gaHook()?.disable()
    clearGaCookies()
  }
  if (level === 'none') removeAllSavedPreferencesToSession()
  publish({ level, settingsOpen: false })
}
