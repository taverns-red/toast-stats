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

import { installGaTransportGuard } from './gaTransportGuard'
import {
  promoteSessionPreferencesToLocal,
  removeAllSavedPreferencesToSession,
} from './preferenceStorage'

export type ConsentLevel = 'all' | 'minimal' | 'none'

export const CONSENT_COOKIE = 'rt_consent'
export const CONSENT_VERSION = 1
const MAX_AGE_SECONDS = 31_536_000 // ~12 months
const SHARED_DOMAIN = '.taverns.red'

const CONSENT_VALUE = new RegExp(`^v${CONSENT_VERSION}\\.(all|minimal|none)$`)

export interface ConsentState {
  level: ConsentLevel | null
  settingsOpen: boolean
}

interface GaHook {
  enable: () => void
  disable: () => void
  /** True once the loader started in this page (gtag.js loaded or armed). */
  ran?: () => boolean
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
  // Exactly `v<CONSENT_VERSION>.<level>`: no padding, case or trailing text.
  // index.html's gate compares the same literal (`v1.all`).
  const m = raw ? CONSENT_VALUE.exec(raw) : null
  return m ? (m[1] as ConsentLevel) : null
}

let state: ConsentState = { level: getConsent(), settingsOpen: false }
const listeners = new Set<() => void>()

/** The level subscribers were last told about (#2945). `state.level` can move
 *  without a publish, when getConsentState re-reads the cookie. */
let publishedLevel = state.level

function publish(next: ConsentState): void {
  state = next
  publishedLevel = next.level
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

/** The control that had focus when the choice was reopened, so the banner can
 *  hand focus back when it closes. */
let returnFocusTo: HTMLElement | null = null

export function openConsentSettings(): void {
  if (!getConsentState().settingsOpen) {
    const active = document.activeElement
    returnFocusTo =
      active instanceof HTMLElement && active !== document.body ? active : null
  }
  publish({ ...getConsentState(), settingsOpen: true })
}

export function closeConsentSettings(): void {
  publish({ ...getConsentState(), settingsOpen: false })
}

/** Give focus back after the banner closes: to the control that reopened it,
 *  else (first visit) to the main content, the skip link's target. */
export function restoreFocusAfterConsent(): void {
  const target =
    returnFocusTo && document.contains(returnFocusTo)
      ? returnFocusTo
      : document.getElementById('main-content')
  returnFocusTo = null
  if (!target) return
  if (
    !target.hasAttribute('tabindex') &&
    !/^(A|BUTTON|INPUT)$/.test(target.tagName)
  ) {
    target.setAttribute('tabindex', '-1')
  }
  // preventScroll: moving focus must not shift the page (#2637).
  target.focus({ preventScroll: true })
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

/** True when Google Analytics started in this page (#2827). */
export function gaRanThisPage(): boolean {
  return gaHook()?.ran?.() === true
}

/* Other open tabs (#2919). Cookies fire no event, so a tab that lowers the
   choice says so on a BroadcastChannel and its siblings apply the same
   guard-and-clear steps. Downgrades only: an upgrade takes effect on the next
   load, as in the same-page case. Where BroadcastChannel is missing, nothing
   changes. */
const SYNC_CHANNEL = 'rt-consent'
let syncChannel: BroadcastChannel | null = null

/** The downgrade steps for a tab told to lower consent. Safe to repeat. */
function applyRemoteDowngrade(level: ConsentLevel | null): void {
  if (gaRanThisPage()) {
    try {
      installGaTransportGuard()
    } catch {
      // The guard is a safety net: the opt-out below still applies.
    }
  }
  gaHook()?.disable()
  clearGaCookies()
  // The steps above are safe to repeat; telling subscribers is not free (each
  // one re-renders), so only do it when the level they know has changed.
  if (level !== publishedLevel) publish({ ...state, level })
}

function onRemoteDowngrade(data: unknown): void {
  const level = (data as { level?: unknown } | null)?.level
  if (level !== 'minimal' && level !== 'none') return
  // The cookie is the truth: ignore a stale signal after a later upgrade.
  if (getConsent() === 'all') return
  applyRemoteDowngrade(level)
}

/* The message can be missed: it can beat the cookie, the page can sit in the
   back/forward cache, or another .taverns.red site changed the cookie. So a
   page where GA ran checks the cookie again when it is shown or becomes
   visible, and takes the same downgrade path if it no longer says all. */
function recheckConsent(): void {
  if (!gaRanThisPage()) return
  const level = getConsent()
  if (level === 'all') return
  applyRemoteDowngrade(level)
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') recheckConsent()
}

function watchForMissedSignal(): void {
  try {
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pageshow', recheckConsent)
  } catch {
    // no DOM events: the channel signal still works
  }
}

function openSyncChannel(): void {
  try {
    if (typeof BroadcastChannel !== 'function') return
    syncChannel = new BroadcastChannel(SYNC_CHANNEL)
    syncChannel.addEventListener('message', e => onRemoteDowngrade(e.data))
  } catch {
    syncChannel = null
  }
}

function announceDowngrade(level: ConsentLevel): void {
  try {
    syncChannel?.postMessage({ level })
  } catch {
    // best effort: this tab has already applied the choice
  }
}

openSyncChannel()
watchForMissedSignal()

/** Test-only: undo the page listeners and channel set up at module load. */
export function teardownConsentListenersForTests(): void {
  // Tests reload this module with vi.resetModules, and the old copies' listeners
  // would stay on `document` and `window` for the rest of the file.
  try {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pageshow', recheckConsent)
  } catch {
    // no DOM events
  }
  try {
    syncChannel?.close()
  } catch {
    // already closed
  }
  syncChannel = null
}

/** Record a choice and apply it at once. */
export function setConsent(level: ConsentLevel): void {
  // A downgrade from a page where GA ran: gtag.js may hold hits it will send
  // whatever the opt-out flag says. So, in this order: drop its requests
  // (the guard stays for the rest of the page's life), set the opt-out flag,
  // store the choice, clear the _ga cookies. No reload (#2827).
  if (level !== 'all' && gaRanThisPage()) {
    try {
      installGaTransportGuard()
    } catch {
      // The guard is a safety net: the choice must still be stored.
    }
  }
  if (level !== 'all') gaHook()?.disable()
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
    clearGaCookies()
  }
  if (level === 'none') removeAllSavedPreferencesToSession()
  else promoteSessionPreferencesToLocal()
  publish({ level, settingsOpen: false })
  // Last, so the cookie the other tabs check is already written.
  if (level !== 'all') announceDowngrade(level)
}
