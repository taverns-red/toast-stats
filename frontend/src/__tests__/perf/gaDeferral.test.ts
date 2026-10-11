/**
 * GA off the critical path (#1830, mobile epic #1827).
 *
 * `gtag/js` is ~176 KB on the wire — the largest script on the site — and it
 * was injected from <head> during parse, so on the throttled mobile profile it
 * competed with the app's own chunks and data for the first seconds of every
 * route. The contract now: the `gtag()` queue exists immediately (so config and
 * SPA page_view events are never dropped), but the library itself is injected
 * only after `load`, when the main thread is idle.
 *
 * Behaviour, not config (Lesson 82): this runs the SHIPPED inline script from
 * frontend/index.html against a fake window/document.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const html = readFileSync(resolve(__dirname, '../../..', 'index.html'), 'utf-8')

function gaInlineScript(): string {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    m => m[1] ?? ''
  )
  const ga = scripts.find(s => s.includes('googletagmanager.com/gtag/js'))
  if (!ga) throw new Error('GA inline script not found in index.html')
  return ga
}

interface FakeEnv {
  window: Record<string, unknown> & {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
  appended: Array<{ src: string; async: boolean }>
  fire: (event: string) => void
  runIdle: () => void
  readyState: string
}

function makeEnv(hostname: string, readyState = 'loading'): FakeEnv {
  const listeners: Record<string, Array<() => void>> = {}
  const idle: Array<() => void> = []
  const appended: FakeEnv['appended'] = []
  const document = {
    readyState,
    createElement: () => ({ src: '', async: false }),
    head: {
      appendChild: (el: { src: string; async: boolean }) => appended.push(el),
    },
  }
  const window: FakeEnv['window'] = {
    location: { hostname },
    document,
    addEventListener: (event: string, fn: () => void) => {
      ;(listeners[event] ??= []).push(fn)
    },
    requestIdleCallback: (fn: () => void) => {
      idle.push(fn)
      return idle.length
    },
    setTimeout: (fn: () => void) => {
      idle.push(fn)
      return idle.length
    },
  }
  return {
    window,
    appended,
    readyState,
    fire: event => (listeners[event] ?? []).forEach(fn => fn()),
    runIdle: () => idle.splice(0).forEach(fn => fn()),
  }
}

function run(env: FakeEnv): void {
  const fn = new Function(
    'window',
    'document',
    'setTimeout',
    'requestIdleCallback',
    gaInlineScript()
  )
  fn(
    env.window,
    env.window['document'],
    env.window['setTimeout'],
    env.window['requestIdleCallback']
  )
}

describe('GA inline loader (#1830)', () => {
  it('does not inject gtag/js during parse on production', () => {
    const env = makeEnv('ts.taverns.red')
    run(env)
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
  })

  it('injects gtag/js once, after load, when the main thread is idle', () => {
    const env = makeEnv('ts.taverns.red')
    run(env)
    env.fire('load')
    expect(env.appended).toHaveLength(0)
    env.runIdle()
    expect(env.appended).toHaveLength(1)
    expect(env.appended[0]?.src).toBe(
      'https://www.googletagmanager.com/gtag/js?id=G-CDWQYHC2Z3'
    )
    expect(env.appended[0]?.async).toBe(true)
  })

  it('still loads when the script runs after load already fired', () => {
    const env = makeEnv('ts.taverns.red', 'complete')
    run(env)
    env.runIdle()
    expect(env.appended).toHaveLength(1)
  })

  it('never loads GA off the production host (localhost, preview channels)', () => {
    for (const host of ['localhost', 'toast-stats--pr-1-abc.web.app']) {
      const env = makeEnv(host)
      run(env)
      env.fire('load')
      env.runIdle()
      expect(env.appended).toHaveLength(0)
      expect(env.window.gtag).toBeUndefined()
    }
  })
})
