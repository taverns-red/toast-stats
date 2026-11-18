import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* #2919: another open tab lowers consent. Cookies fire no event, so the tab
   that lowers it tells its siblings on a BroadcastChannel, and they apply the
   same guard-and-clear steps as the same-page downgrade (#2827). */

const CONSENT_COOKIE = 'rt_consent'
const win = window as unknown as Record<string, unknown>
const g = globalThis as Record<string, unknown>
const savedFetch = win['fetch']
const savedBc = g['BroadcastChannel']
const GA_URL = 'https://www.google-analytics.com/g/collect'

type Handler = (e: { data: unknown }) => void

class FakeChannel {
  static all: FakeChannel[] = []
  handlers: Handler[] = []
  constructor(public name: string) {
    FakeChannel.all.push(this)
  }
  addEventListener(_type: string, h: Handler) {
    this.handlers.push(h)
  }
  postMessage(data: unknown) {
    for (const c of FakeChannel.all) {
      if (c !== this && c.name === this.name)
        c.handlers.forEach(h => h({ data }))
    }
  }
  closed = false
  close() {
    this.closed = true
  }
}

function wipeCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; Path=/`
}

/** A fresh copy of the modules, as a second tab would load them. */
const loadedTabs: Array<{ teardownConsentListenersForTests(): void }> = []

async function loadTab() {
  vi.resetModules()
  const consent = await import('../consent')
  loadedTabs.push(consent)
  const guard = await import('../gaTransportGuard')
  return { consent, guard }
}

function gaRan(disable = vi.fn()) {
  win['__tsGa'] = { enable: vi.fn(), disable, ran: () => true }
  return disable
}

describe('another tab lowers consent (#2919)', () => {
  beforeEach(() => {
    FakeChannel.all = []
    g['BroadcastChannel'] = FakeChannel
    wipeCookie(CONSENT_COOKIE)
    wipeCookie('_ga')
  })

  afterEach(() => {
    // Each loadTab() copy of the module attached its own listeners (#2945).
    for (const t of loadedTabs.splice(0)) t.teardownConsentListenersForTests()
    win['fetch'] = savedFetch
    delete win['__tsGa']
    g['BroadcastChannel'] = savedBc
  })

  it.each(['minimal', 'none'] as const)(
    'a downgrade to %s in the other tab installs the guard and clears _ga here',
    async level => {
      const { consent, guard } = await loadTab()
      const orig = vi.fn(async () => new Response('real'))
      win['fetch'] = orig
      const disable = gaRan()
      // What the other tab leaves behind: its cookie, and gtag's cookie
      document.cookie = `${CONSENT_COOKIE}=v1.${level}; path=/`
      document.cookie = '_ga=GA1.1.1; path=/'
      new FakeChannel('rt-consent').postMessage({ level })
      try {
        const res = await window.fetch(GA_URL)
        expect(res.status).toBe(204)
        expect(orig).not.toHaveBeenCalled()
        expect(disable).toHaveBeenCalled()
        expect(document.cookie).not.toContain('_ga=')
        expect(consent.getConsent()).toBe(level)
      } finally {
        guard.uninstallGaTransportGuard()
      }
    }
  )

  it('ignores a signal when GA never ran in this page', async () => {
    const { guard } = await loadTab()
    const orig = vi.fn(async () => new Response('real'))
    win['fetch'] = orig
    new FakeChannel('rt-consent').postMessage({ level: 'minimal' })
    await window.fetch(GA_URL)
    expect(orig).toHaveBeenCalledTimes(1)
    guard.uninstallGaTransportGuard()
  })

  it('ignores a downgrade message while the cookie says all', async () => {
    const { guard } = await loadTab()
    const orig = vi.fn(async () => new Response('real'))
    win['fetch'] = orig
    const disable = gaRan()
    document.cookie = `${CONSENT_COOKIE}=v1.all; path=/`
    document.cookie = '_ga=GA1.1.1; path=/'
    new FakeChannel('rt-consent').postMessage({ level: 'minimal' })
    await window.fetch(GA_URL)
    expect(orig).toHaveBeenCalledTimes(1)
    expect(disable).not.toHaveBeenCalled()
    expect(document.cookie).toContain('_ga=')
    guard.uninstallGaTransportGuard()
  })

  /* The message can be missed: it can beat the cookie, a page can be in the
     back/forward cache, or another .taverns.red site changed the cookie. So a
     tab re-checks the cookie when it becomes visible or is shown again. */
  describe('re-check when no message arrives', () => {
    function setVisibility(state: 'visible' | 'hidden') {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => state,
      })
    }

    afterEach(() => {
      delete (document as unknown as Record<string, unknown>)['visibilityState']
    })

    it('visibilitychange to visible, cookie now minimal: guard on, _ga cleared', async () => {
      const { guard } = await loadTab()
      const orig = vi.fn(async () => new Response('real'))
      win['fetch'] = orig
      const disable = gaRan()
      document.cookie = `${CONSENT_COOKIE}=v1.all; path=/`
      document.cookie = '_ga=GA1.1.1; path=/'
      // the cookie flips with no message
      document.cookie = `${CONSENT_COOKIE}=v1.minimal; path=/`
      setVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      try {
        const res = await window.fetch(GA_URL)
        expect(res.status).toBe(204)
        expect(orig).not.toHaveBeenCalled()
        expect(disable).toHaveBeenCalled()
        expect(document.cookie).not.toContain('_ga=')
      } finally {
        guard.uninstallGaTransportGuard()
      }
    })

    it('does nothing when the page becomes hidden', async () => {
      const { guard } = await loadTab()
      const orig = vi.fn(async () => new Response('real'))
      win['fetch'] = orig
      gaRan()
      document.cookie = `${CONSENT_COOKIE}=v1.minimal; path=/`
      setVisibility('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
      await window.fetch(GA_URL)
      expect(orig).toHaveBeenCalledTimes(1)
      guard.uninstallGaTransportGuard()
    })

    it('pageshow from the back/forward cache, cookie now minimal: guard on, _ga cleared', async () => {
      const { guard } = await loadTab()
      const orig = vi.fn(async () => new Response('real'))
      win['fetch'] = orig
      const disable = gaRan()
      document.cookie = '_ga=GA1.1.1; path=/'
      document.cookie = `${CONSENT_COOKIE}=v1.minimal; path=/`
      const ev = new Event('pageshow') as Event & { persisted: boolean }
      Object.defineProperty(ev, 'persisted', { value: true })
      window.dispatchEvent(ev)
      try {
        const res = await window.fetch(GA_URL)
        expect(res.status).toBe(204)
        expect(orig).not.toHaveBeenCalled()
        expect(disable).toHaveBeenCalled()
        expect(document.cookie).not.toContain('_ga=')
      } finally {
        guard.uninstallGaTransportGuard()
      }
    })

    it('does not notify subscribers again when a re-check finds the level they already have (#2945)', async () => {
      const { consent, guard } = await loadTab()
      win['fetch'] = vi.fn(async () => new Response('real'))
      gaRan()
      document.cookie = `${CONSENT_COOKIE}=v1.minimal; path=/`
      const seen = vi.fn()
      consent.subscribeConsent(seen)
      setVisibility('visible')
      try {
        document.dispatchEvent(new Event('visibilitychange'))
        window.dispatchEvent(new Event('pageshow'))
        document.dispatchEvent(new Event('visibilitychange'))
        expect(seen).toHaveBeenCalledTimes(1)
        expect(consent.getConsent()).toBe('minimal')
      } finally {
        guard.uninstallGaTransportGuard()
      }
    })

    it('still notifies when the level changes again (#2945)', async () => {
      const { consent, guard } = await loadTab()
      win['fetch'] = vi.fn(async () => new Response('real'))
      gaRan()
      document.cookie = `${CONSENT_COOKIE}=v1.minimal; path=/`
      const seen = vi.fn()
      consent.subscribeConsent(seen)
      setVisibility('visible')
      try {
        document.dispatchEvent(new Event('visibilitychange'))
        document.cookie = `${CONSENT_COOKIE}=v1.none; path=/`
        document.dispatchEvent(new Event('visibilitychange'))
        expect(seen).toHaveBeenCalledTimes(2)
      } finally {
        guard.uninstallGaTransportGuard()
      }
    })

    it('leaves a page alone while the cookie still says all', async () => {
      const { guard } = await loadTab()
      const orig = vi.fn(async () => new Response('real'))
      win['fetch'] = orig
      const disable = gaRan()
      document.cookie = `${CONSENT_COOKIE}=v1.all; path=/`
      setVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('pageshow'))
      await window.fetch(GA_URL)
      expect(orig).toHaveBeenCalledTimes(1)
      expect(disable).not.toHaveBeenCalled()
      guard.uninstallGaTransportGuard()
    })

    it('does nothing where GA never ran', async () => {
      const { guard } = await loadTab()
      const orig = vi.fn(async () => new Response('real'))
      win['fetch'] = orig
      document.cookie = `${CONSENT_COOKIE}=v1.minimal; path=/`
      setVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      await window.fetch(GA_URL)
      expect(orig).toHaveBeenCalledTimes(1)
      guard.uninstallGaTransportGuard()
    })
  })

  it('teardown removes the page listeners and closes the channel (#2945)', async () => {
    const added: Array<[object, string, unknown]> = []
    const removed: Array<[object, string, unknown]> = []
    const addDoc = vi
      .spyOn(document, 'addEventListener')
      .mockImplementation((t, l) => void added.push([document, t, l]))
    const addWin = vi
      .spyOn(window, 'addEventListener')
      .mockImplementation((t, l) => void added.push([window, t, l]))
    const remDoc = vi
      .spyOn(document, 'removeEventListener')
      .mockImplementation((t, l) => void removed.push([document, t, l]))
    const remWin = vi
      .spyOn(window, 'removeEventListener')
      .mockImplementation((t, l) => void removed.push([window, t, l]))
    try {
      const { consent } = await loadTab()
      const mine = added.filter(
        ([, t]) => t === 'visibilitychange' || t === 'pageshow'
      )
      expect(mine).toHaveLength(2)
      consent.teardownConsentListenersForTests()
      for (const a of mine) {
        expect(removed).toContainEqual(a)
      }
      expect(FakeChannel.all.every(c => c.closed)).toBe(true)
    } finally {
      addDoc.mockRestore()
      addWin.mockRestore()
      remDoc.mockRestore()
      remWin.mockRestore()
    }
  })

  it('ignores an upgrade and malformed messages', async () => {
    const { guard } = await loadTab()
    const orig = vi.fn(async () => new Response('real'))
    win['fetch'] = orig
    gaRan()
    const other = new FakeChannel('rt-consent')
    other.postMessage({ level: 'all' })
    other.postMessage('minimal')
    other.postMessage(null)
    await window.fetch(GA_URL)
    expect(orig).toHaveBeenCalledTimes(1)
    guard.uninstallGaTransportGuard()
  })

  it('tells other tabs when this one lowers consent, not when it raises it', async () => {
    const { consent } = await loadTab()
    const seen: unknown[] = []
    new FakeChannel('rt-consent').addEventListener('message', e =>
      seen.push(e.data)
    )
    consent.setConsent('minimal')
    consent.setConsent('all')
    expect(seen).toEqual([{ level: 'minimal' }])
  })

  it('works where BroadcastChannel does not exist', async () => {
    delete g['BroadcastChannel']
    const { consent } = await loadTab()
    expect(() => consent.setConsent('minimal')).not.toThrow()
    expect(consent.getConsent()).toBe('minimal')
  })
})
