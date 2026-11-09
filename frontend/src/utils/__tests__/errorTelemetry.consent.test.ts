import { beforeEach, describe, expect, it } from 'vitest'
import { recordError, getStoredErrors } from '../errorTelemetry'

/* The error log is a saved preference-like store (#2584): under "none" it
   must not touch localStorage, so it ends with the tab. */

describe('errorTelemetry under consent (#2584)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('none: records to sessionStorage only', () => {
    document.cookie = 'rt_consent=v1.none; Path=/'
    recordError(new Error('boom'))
    expect(localStorage.getItem('toast-stats-error-telemetry')).toBeNull()
    expect(sessionStorage.getItem('toast-stats-error-telemetry')).not.toBeNull()
    expect(getStoredErrors()).toHaveLength(1)
  })

  it('no choice yet: records to sessionStorage only', () => {
    document.cookie = 'rt_consent=; Max-Age=0; Path=/'
    recordError(new Error('boom'))
    expect(localStorage.getItem('toast-stats-error-telemetry')).toBeNull()
    expect(getStoredErrors()).toHaveLength(1)
  })

  it('minimal: records to localStorage', () => {
    document.cookie = 'rt_consent=v1.minimal; Path=/'
    recordError(new Error('boom'))
    expect(localStorage.getItem('toast-stats-error-telemetry')).not.toBeNull()
  })
})
