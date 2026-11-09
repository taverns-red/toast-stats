import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import {
  closeConsentSettings,
  getConsentState,
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
      <p className="consent-banner__text">
        {state.level === null
          ? 'We would like to count visits with Google Analytics. Choose what you are happy with.'
          : `Your choice is ${LABEL[state.level]}. You can change it here.`}{' '}
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
            onClick={() => setConsent(level)}
          >
            {label}
          </button>
        ))}
      </div>
      {reopened && (
        <button
          type="button"
          className="consent-banner__close"
          onClick={closeConsentSettings}
        >
          Close
        </button>
      )}
    </section>
  )
}

export default ConsentBanner
