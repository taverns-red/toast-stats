import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import {
  closeConsentSettings,
  getConsentState,
  restoreFocusAfterConsent,
  setConsent,
  subscribeConsent,
  type ConsentLevel,
} from '../../utils/consent'

/* Cookie and analytics notice (#2584).

   - Opt-in: nothing non-essential runs until a button is pressed.
   - Non-blocking fixed overlay: it never changes page layout (CLS) and is
     not the LCP element, because it is first shown after the page has
     loaded and gone idle (`immediate` skips that wait, for tests and for a
     reopened choice).
   - Three equally weighted buttons, no pre-selected option.
   - Reopened from "Privacy & cookies" (footer / About menu) with a Close. */

const LABEL: Record<ConsentLevel, string> = {
  all: 'all',
  minimal: 'minimal',
  none: 'none',
}

function useAfterLoadAndIdle(immediate: boolean): boolean {
  const [ready, setReady] = useState(immediate)
  useEffect(() => {
    if (immediate) return
    let cancelled = false
    let cancelIdle: () => void = () => {}
    const reveal = () => !cancelled && setReady(true)
    const show = () => {
      if (cancelled) return
      if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(reveal, { timeout: 1500 })
        cancelIdle = () => window.cancelIdleCallback(id)
      } else {
        const id = globalThis.setTimeout(reveal, 300)
        cancelIdle = () => globalThis.clearTimeout(id)
      }
    }
    if (document.readyState === 'complete') show()
    else window.addEventListener('load', show, { once: true })
    return () => {
      cancelled = true
      window.removeEventListener('load', show)
      cancelIdle()
    }
  }, [immediate])
  return ready
}

export const ConsentBanner: React.FC<{ immediate?: boolean }> = ({
  immediate = false,
}) => {
  const state = useSyncExternalStore(
    subscribeConsent,
    getConsentState,
    getConsentState
  )
  const ready = useAfterLoadAndIdle(immediate)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const reopened = state.level !== null && state.settingsOpen
  const visible = state.level === null ? ready : state.settingsOpen

  useEffect(() => {
    if (reopened) headingRef.current?.focus()
  }, [reopened])

  // Escape closes a reopened banner and keeps the current choice. The first
  // visit has no choice to keep, so Escape does nothing there.
  useEffect(() => {
    if (!reopened) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      closeConsentSettings()
      restoreFocusAfterConsent()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [reopened])

  if (!visible) return null

  return (
    <section
      className="consent-banner"
      role="region"
      aria-label="Privacy and cookies"
      data-testid="consent-banner"
    >
      <h2 className="consent-banner__title" tabIndex={-1} ref={headingRef}>
        Privacy and cookies
      </h2>
      {/* One short line of copy, with the link in its own block: the largest
          text block here must stay smaller than the page's own first-screen
          text, or the banner becomes the LCP element (#2584: it did, 2.0 s to
          3.6 s on landing at 375). */}
      <p className="consent-banner__text">
        {state.level === null
          ? 'May we count visits with Google Analytics?'
          : `Your choice is ${LABEL[state.level]}. You can change it here.`}
      </p>
      <p className="consent-banner__more">
        <Link to="/privacy" className="consent-banner__link">
          What each choice stores
        </Link>
      </p>
      <div className="consent-banner__actions">
        {(
          [
            ['all', 'Keep all'],
            ['minimal', 'Keep minimal'],
            ['none', 'Keep none'],
          ] as const
        ).map(([level, label]) => (
          <button
            key={level}
            type="button"
            className="consent-banner__button"
            onClick={() => {
              setConsent(level)
              restoreFocusAfterConsent()
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {reopened && (
        <button
          type="button"
          className="consent-banner__close"
          onClick={() => {
            closeConsentSettings()
            restoreFocusAfterConsent()
          }}
        >
          Close
        </button>
      )}
    </section>
  )
}

export default ConsentBanner
