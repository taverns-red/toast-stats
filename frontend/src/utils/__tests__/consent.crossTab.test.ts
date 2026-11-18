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
  close() {}
}

function wipeCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; Path=/`
}

/** A fresh copy of the modules, as a second tab would load them. */
async function loadTab() {
  vi.resetModules()
  const consent = await import('../consent')
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
