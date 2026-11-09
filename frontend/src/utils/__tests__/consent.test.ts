import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONSENT_COOKIE,
  CONSENT_VERSION,
  buildConsentCookie,
  closeConsentSettings,
  gaCookieExpiries,
  getConsent,
  getConsentState,
  openConsentSettings,
  setConsent,
  subscribeConsent,
} from '../consent'

/* Consent store (#2584). The choice is one first-party cookie, `rt_consent`,
   shared across *.taverns.red so a visitor answers once (ops#319). It is
   stored under every level (strictly necessary: without it the banner
   returns on every page) and versioned so a policy change can ask again. */

function wipeCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; Path=/`
}

describe('consent store (#2584)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    wipeCookie(CONSENT_COOKIE)
    wipeCookie('_ga')
    wipeCookie('_ga_CDWQYHC2Z3')
    wipeCookie('keepme')
    delete (window as unknown as Record<string, unknown>)['__tsGa']
    closeConsentSettings()
  })

  it('names the cookie rt_consent', () => {
    expect(CONSENT_COOKIE).toBe('rt_consent')
  })

  it('is undecided until a choice is made', () => {
    expect(getConsent()).toBeNull()
  })

  it.each(['all', 'minimal', 'none'] as const)('stores %s', level => {
    setConsent(level)
    expect(getConsent()).toBe(level)
    expect(document.cookie).toContain(`rt_consent=v${CONSENT_VERSION}.${level}`)
    expect(localStorage.getItem('rt_consent')).toBeNull()
  })

  it('asks again when the stored version is not the current one', () => {
    document.cookie = `rt_consent=v${CONSENT_VERSION - 1}.all; Path=/`
    expect(getConsent()).toBeNull()
  })

  it.each(['v01.all', 'v1.ALL', 'V1.all', 'v1.all.x', 'v10.all'])(
    'accepts only the exact value: %j is undecided',
    value => {
      document.cookie = `rt_consent=${value}; Path=/`
      expect(getConsent()).toBeNull()
    }
  )

  it('treats a corrupt or unknown value as undecided', () => {
    document.cookie = 'rt_consent=garbage; Path=/'
    expect(getConsent()).toBeNull()
    document.cookie = `rt_consent=v${CONSENT_VERSION}.everything; Path=/`
    expect(getConsent()).toBeNull()
  })

  it('"all" enables Google Analytics', () => {
    const enable = vi.fn()
    const disable = vi.fn()
    ;(window as unknown as Record<string, unknown>)['__tsGa'] = {
      enable,
      disable,
    }
    setConsent('all')
    expect(enable).toHaveBeenCalledTimes(1)
    expect(disable).not.toHaveBeenCalled()
  })

  it.each(['minimal', 'none'] as const)(
    '%s disables Google Analytics and clears _ga cookies',
    level => {
      const enable = vi.fn()
      const disable = vi.fn()
      ;(window as unknown as Record<string, unknown>)['__tsGa'] = {
        enable,
        disable,
      }
      document.cookie = '_ga=GA1.1.1; path=/'
      document.cookie = '_ga_CDWQYHC2Z3=GS1; path=/'
      document.cookie = 'keepme=1; path=/'
      setConsent(level)
      expect(enable).not.toHaveBeenCalled()
      expect(disable).toHaveBeenCalledTimes(1)
      expect(document.cookie).not.toMatch(/_ga/)
      expect(document.cookie).toMatch(/keepme=1/)
    }
  )

  it('"none" moves saved preferences to the tab session', () => {
    localStorage.setItem('theme', 'dark')
    localStorage.setItem('toast-stats:v1:myDistrict', '"61"')
    setConsent('none')
    expect(localStorage.getItem('theme')).toBeNull()
    expect(localStorage.getItem('toast-stats:v1:myDistrict')).toBeNull()
    expect(sessionStorage.getItem('theme')).toBe('dark')
    expect(sessionStorage.getItem('toast-stats:v1:myDistrict')).toBe('"61"')
    expect(getConsent()).toBe('none')
  })

  it('"minimal" and "all" leave saved preferences alone', () => {
    localStorage.setItem('theme', 'dark')
    setConsent('minimal')
    expect(localStorage.getItem('theme')).toBe('dark')
    setConsent('all')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('notifies subscribers and exposes the reopened-settings flag', () => {
    const cb = vi.fn()
    const off = subscribeConsent(cb)
    openConsentSettings()
    expect(getConsentState().settingsOpen).toBe(true)
    setConsent('minimal')
    expect(getConsentState()).toEqual({ level: 'minimal', settingsOpen: false })
    expect(cb).toHaveBeenCalled()
    off()
    cb.mockClear()
    openConsentSettings()
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('buildConsentCookie (#2584, ops#319)', () => {
  it.each(['ts.taverns.red', 'taverns.red', 'cdn.taverns.red'])(
    'on %s: shared across .taverns.red, Secure, Lax, ~12 months',
    host => {
      const c = buildConsentCookie('minimal', host, 'https:')
      expect(c).toContain('rt_consent=v1.minimal')
      expect(c).toContain('Domain=.taverns.red')
      expect(c).toContain('Path=/')
      expect(c).toContain('SameSite=Lax')
      expect(c).toContain('Secure')
      expect(c).toContain('Max-Age=31536000')
    }
  )

  it.each(['localhost', 'toast-stats-staging--pr-12-abc.web.app'])(
    'on %s: host-only, no Domain attribute',
    host => {
      const c = buildConsentCookie('all', host, 'http:')
      expect(c).toContain('rt_consent=v1.all')
      expect(c).not.toContain('Domain=')
      expect(c).not.toContain('Secure')
      expect(c).toContain('SameSite=Lax')
    }
  )

  it('is Secure on any https host', () => {
    expect(buildConsentCookie('none', 'x.web.app', 'https:')).toContain(
      'Secure'
    )
  })

  it('does not treat a lookalike host as taverns.red', () => {
    expect(
      buildConsentCookie('all', 'evil-taverns.red', 'https:')
    ).not.toContain('Domain=')
  })
})

describe('gaCookieExpiries (#2584, ops#319)', () => {
  it('expires each _ga* cookie on the host and on .taverns.red', () => {
    const out = gaCookieExpiries(
      ['_ga', '_ga_CDWQYHC2Z3', 'keepme'],
      'ts.taverns.red'
    )
    for (const name of ['_ga', '_ga_CDWQYHC2Z3']) {
      expect(
        out.some(c => c.startsWith(`${name}=;`) && !c.includes('Domain='))
      ).toBe(true)
      expect(
        out.some(
          c => c.startsWith(`${name}=;`) && c.includes('Domain=ts.taverns.red')
        )
      ).toBe(true)
      expect(
        out.some(
          c => c.startsWith(`${name}=;`) && c.includes('Domain=.taverns.red')
        )
      ).toBe(true)
    }
    expect(out.some(c => c.startsWith('keepme='))).toBe(false)
    expect(
      out.every(c => c.includes('Max-Age=0') && c.includes('Path=/'))
    ).toBe(true)
  })

  it('off taverns.red only expires host-only and host-domain cookies', () => {
    const out = gaCookieExpiries(['_ga'], 'localhost')
    expect(out.some(c => c.includes('.taverns.red'))).toBe(false)
    expect(out.length).toBeGreaterThan(0)
  })
})
