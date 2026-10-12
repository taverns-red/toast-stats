/**
 * GA off the critical path (#1830, #1906; mobile epic #1827).
 *
 * `gtag/js` is ~176 KB on the wire — the largest script on the site.
 *
 * #1830 moved it from <head> parse to `load` + idle. That was not enough: in
 * this SPA `load` fires before any CDN data arrives, so gtag was still in
 * flight while the first screen waited on data. Whether it started before or
 * after the observed LCP was a race, and Lighthouse's Lantern charges every
 * request that finishes before the observed LCP — so the mobile LCP was
 * bimodal (`/district/61` 5.7 / 8.1 / 8.1 s on the runner; every slow run had
 * gtag starting before the observed LCP, #1906).
 *
 * The contract now:
 * - the `gtag()` queue exists immediately, so config and SPA page_view events
 *   are buffered in `dataLayer` (Google processes queued pushes FIFO once the
 *   library loads — https://developers.google.com/tag-platform/devguides/datalayer);
 * - the library is injected only once the first screen has SETTLED: after
 *   `load`, with no new LCP candidate and no data fetch finishing for a quiet
 *   window, then on idle;
 * - it always loads: a hard cap after `load`, the first user interaction, or
 *   the tab going hidden all inject it at once.
 *
 * Behaviour, not config (Lesson 82): this runs the SHIPPED inline script from
 * frontend/index.html against a fake window/document/clock.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const html = readFileSync(resolve(__dirname, '../../..', 'index.html'), 'utf-8')
const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js?id=G-CDWQYHC2Z3'

function gaInlineScript(): string {
  const scripts = [
    ...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\b[^>]*>/gi),
  ].map(m => m[1] ?? '')
  const ga = scripts.find(s => s.includes('googletagmanager.com/gtag/js'))
  if (!ga) throw new Error('GA inline script not found in index.html')
  return ga
}

type Listener = (ev?: unknown) => void
interface FakeEntry {
  entryType: string
  initiatorType?: string
}

interface FakeEnv {
  window: Record<string, unknown> & {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
  document: Record<string, unknown> & { visibilityState: string }
  appended: Array<{ src: string; async: boolean }>
  /** Advance the fake clock, firing due timers in order. */
  advance: (ms: number) => void
  /** Run every pending idle callback. */
  runIdle: () => void
  fireWindow: (event: string) => void
  fireDocument: (event: string) => void
  /** Deliver performance entries to observers of that entry type. */
  emit: (type: string, entries: FakeEntry[]) => void
  observedTypes: () => string[]
}

function makeEnv(
  hostname: string,
  opts: { readyState?: string; perfObserver?: boolean } = {}
): FakeEnv {
  const { readyState = 'loading', perfObserver = true } = opts
  const winListeners: Record<string, Listener[]> = {}
  const docListeners: Record<string, Listener[]> = {}
  const idle: Listener[] = []
  const appended: FakeEnv['appended'] = []
  let now = 0
  let nextId = 1
  const timers = new Map<number, { at: number; fn: Listener }>()
  const observers: Array<{ type: string; cb: (list: unknown) => void }> = []

  const document: FakeEnv['document'] = {
    readyState,
    visibilityState: 'visible',
    createElement: () => ({ src: '', async: false }),
    head: {
      appendChild: (el: { src: string; async: boolean }) => appended.push(el),
    },
    addEventListener: (event: string, fn: Listener) => {
      ;(docListeners[event] ??= []).push(fn)
    },
  }

  class FakePerformanceObserver {
    private cb: (list: unknown) => void
    constructor(cb: (list: unknown) => void) {
      this.cb = cb
    }
    observe(o: { type: string }) {
      observers.push({ type: o.type, cb: this.cb })
    }
    disconnect() {}
  }

  const window: FakeEnv['window'] = {
    location: { hostname },
    document,
    addEventListener: (event: string, fn: Listener) => {
      ;(winListeners[event] ??= []).push(fn)
    },
    requestIdleCallback: (fn: Listener) => {
      idle.push(fn)
      return idle.length
    },
    setTimeout: (fn: Listener, ms = 0) => {
      const id = nextId++
      timers.set(id, { at: now + ms, fn })
      return id
    },
    clearTimeout: (id: number) => {
      timers.delete(id)
    },
    ...(perfObserver ? { PerformanceObserver: FakePerformanceObserver } : {}),
  }

  const advance = (ms: number) => {
    const end = now + ms
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      timers.delete(due[0])
      now = due[1].at
      due[1].fn()
    }
    now = end
  }

  return {
    window,
    document,
    appended,
    advance,
    runIdle: () => idle.splice(0).forEach(fn => fn()),
    fireWindow: e => (winListeners[e] ?? []).forEach(fn => fn()),
    fireDocument: e => (docListeners[e] ?? []).forEach(fn => fn()),
    emit: (type, entries) =>
      observers
        .filter(o => o.type === type)
        .forEach(o => o.cb({ getEntries: () => entries })),
    observedTypes: () => observers.map(o => o.type),
  }
}

function run(env: FakeEnv): void {
  const fn = new Function('window', 'document', gaInlineScript())
  fn(env.window, env.document)
}

const lcp = (env: FakeEnv) =>
  env.emit('largest-contentful-paint', [
    { entryType: 'largest-contentful-paint' },
  ])
const fetchDone = (env: FakeEnv) =>
  env.emit('resource', [{ entryType: 'resource', initiatorType: 'fetch' }])

/** Advance in small steps, running idle callbacks as a browser would. */
function settle(env: FakeEnv, ms: number): void {
  for (let t = 0; t < ms; t += 100) {
    env.advance(100)
    env.runIdle()
  }
}

describe('GA inline loader (#1830, #1906)', () => {
  it('does not inject gtag/js during parse on production', () => {
    const env = makeEnv('ts.taverns.red')
    run(env)
    env.runIdle()
    expect(env.appended).toHaveLength(0)
  })

  it('queues gtag() calls immediately so no event is dropped before the library loads', () => {
    const env = makeEnv('ts.taverns.red')
    run(env)
    expect(typeof env.window.gtag).toBe('function')
    const queued = (env.window.dataLayer ?? []).map(a =>
      Array.from(a as ArrayLike<unknown>)
    )
    expect(queued.map(a => a[0])).toEqual(['js', 'config'])
    expect(queued[1]?.[1]).toBe('G-CDWQYHC2Z3')
    // Privacy settings are unchanged (#314).
    expect(queued[1]?.[2]).toEqual({
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    })
  })

  it('does NOT inject at load + idle while the first screen is still painting (#1906 bimodality)', () => {
    const env = makeEnv('ts.taverns.red')
    run(env)
    env.fireWindow('load')
    env.runIdle()
    expect(env.appended).toHaveLength(0)
    // Data keeps arriving and new LCP candidates keep painting, 1.5 s apart.
    for (let i = 0; i < 4; i++) {
      settle(env, 1500)
      fetchDone(env)
      lcp(env)
    }
    expect(env.appended).toHaveLength(0)
  })

  it('injects gtag/js once, after the first screen settles (no new LCP candidate or data fetch for the quiet window)', () => {
    const env = makeEnv('ts.taverns.red')
    run(env)
    lcp(env)
    env.fireWindow('load')
    settle(env, 1000)
    fetchDone(env)
    lcp(env)
    settle(env, 1900)
    expect(env.appended).toHaveLength(0)
    settle(env, 300)
    expect(env.appended).toHaveLength(1)
    expect(env.appended[0]?.src).toBe(GTAG_SRC)
    expect(env.appended[0]?.async).toBe(true)
    // Later paints, fetches, interactions and the cap never inject twice.
    lcp(env)
    fetchDone(env)
    env.fireWindow('pointerdown')
    settle(env, 15000)
    expect(env.appended).toHaveLength(1)
  })

  it('does not start the quiet window before load, but has a backstop if load never fires', () => {
    const env = makeEnv('ts.taverns.red')
    run(env)
    lcp(env)
    settle(env, 8000)
    expect(env.appended).toHaveLength(0)
    settle(env, 13000)
    expect(env.appended).toHaveLength(1)
  })

  it('observes LCP candidates and resource timing', () => {
    const env = makeEnv('ts.taverns.red')
    run(env)
    expect(env.observedTypes()).toEqual(
      expect.arrayContaining(['largest-contentful-paint', 'resource'])
    )
  })

  it('always loads: a hard cap after load even if the page never goes quiet', () => {
    const env = makeEnv('ts.taverns.red')
    run(env)
    env.fireWindow('load')
    for (let i = 0; i < 12; i++) {
      settle(env, 1000)
      fetchDone(env)
    }
    expect(env.appended).toHaveLength(1)
  })

  it('loads at once on the first user interaction (LCP is final after input)', () => {
    for (const event of ['pointerdown', 'keydown']) {
      const env = makeEnv('ts.taverns.red')
      run(env)
      env.fireWindow(event)
      expect(env.appended).toHaveLength(1)
    }
  })

  it('loads at once when the tab goes hidden, so a short visit still sends its queued hits', () => {
    const env = makeEnv('ts.taverns.red')
    run(env)
    env.document.visibilityState = 'hidden'
    env.fireDocument('visibilitychange')
    expect(env.appended).toHaveLength(1)
  })

  it('still loads when the script runs after load already fired', () => {
    const env = makeEnv('ts.taverns.red', { readyState: 'complete' })
    run(env)
    settle(env, 2500)
    expect(env.appended).toHaveLength(1)
  })

  it('still loads without PerformanceObserver support (quiet window after load)', () => {
    const env = makeEnv('ts.taverns.red', { perfObserver: false })
    run(env)
    env.fireWindow('load')
    settle(env, 2500)
    expect(env.appended).toHaveLength(1)
  })

  it('never loads GA off the production host (localhost, preview channels)', () => {
    for (const host of ['localhost', 'toast-stats--pr-1-abc.web.app']) {
      const env = makeEnv(host)
      run(env)
      env.fireWindow('load')
      env.fireWindow('pointerdown')
      settle(env, 15000)
      expect(env.appended).toHaveLength(0)
      expect(env.window.gtag).toBeUndefined()
    }
  })
})
