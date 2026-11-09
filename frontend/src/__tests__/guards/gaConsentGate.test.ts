/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/* The GA gate in frontend/index.html (#2584). The inline loader keeps its
   #314/#1830/#1906/#1946 behaviour (deferred load, one config, gtag owns
   page_view); this proves it now waits for consent, read from the shared
   `rt_consent` cookie. The script is extracted from index.html and run
   against a fake window, so the test exercises the shipped bytes. */

const html = readFileSync(join(__dirname, '../../../index.html'), 'utf8')
/** Inline <script> bodies, found by scanning case-insensitively (no regex
 *  HTML filtering: it misses `<SCRIPT>` and `</script >`). */
function inlineScripts(source: string): string[] {
  const lower = source.toLowerCase()
  const out: string[] = []
  let from = 0
  for (;;) {
    const open = lower.indexOf('<script', from)
    if (open === -1) return out
    const bodyStart = lower.indexOf('>', open) + 1
    const close = lower.indexOf('</script', bodyStart)
    if (bodyStart === 0 || close === -1) return out
    out.push(source.slice(bodyStart, close))
    from = close + 1
  }
}

const gaScript = (() => {
  const found = inlineScripts(html).find(s => s.includes('G-CDWQYHC2Z3'))
  if (!found) throw new Error('GA script not found in index.html')
  return found
})()

interface Run {
  appended: string[]
  dataLayer: unknown[][]
  win: Record<string, any>
}

function run(opts: {
  hostname?: string
  cookie?: string
  readyState?: string
  fireTimers?: boolean
}): Run {
  const appended: string[] = []
  const timers: Array<() => void> = []
  const win: Record<string, any> = {
    location: { hostname: opts.hostname ?? 'ts.taverns.red' },
    setTimeout: (fn: () => void) => timers.push(fn),
    clearTimeout: () => {},
    addEventListener: () => {},
    requestIdleCallback: (fn: () => void) => fn(),
  }
  const doc = {
    cookie: opts.cookie ?? '',
    readyState: opts.readyState ?? 'complete',
    visibilityState: 'visible',
    createElement: () => ({}) as Record<string, string>,
    head: { appendChild: (el: { src: string }) => appended.push(el.src) },
    addEventListener: () => {},
  }
  win['document'] = doc
  new Function('window', 'document', gaScript)(win, doc)
  const r: Run = {
    appended,
    get dataLayer() {
      return (win['dataLayer'] ?? []) as unknown[][]
    },
    win,
  }
  if (opts.fireTimers !== false) timers.forEach(t => t()) // fire the deferred triggers the loader armed
  return r
}

describe('GA consent gate (#2584)', () => {
  it.each([
    ['undecided', ''],
    ['minimal', 'rt_consent=v1.minimal'],
    ['none', 'a=b; rt_consent=v1.none'],
    ['a stale version', 'rt_consent=v0.all'],
    ['a garbled value', 'rt_consent=all'],
  ])('%s: no GA request, no dataLayer config', (_n, cookie) => {
    const r = run({ cookie })
    expect(r.appended).toEqual([])
    expect(r.dataLayer).toEqual([])
  })

  it('all: loads the gtag library once, with exactly one config', () => {
    const r = run({ cookie: 'x=1; rt_consent=v1.all' })
    expect(r.appended).toEqual([
      'https://www.googletagmanager.com/gtag/js?id=G-CDWQYHC2Z3',
    ])
    expect(r.dataLayer.filter(a => a[0] === 'config')).toHaveLength(1)
  })

  it('all: keeps the loader deferred (nothing loads while the page loads)', () => {
    const r = run({
      cookie: 'rt_consent=v1.all',
      readyState: 'loading',
      fireTimers: false,
    })
    expect(r.appended).toEqual([])
  })

  it('never runs off the production hostname', () => {
    const r = run({ hostname: 'localhost', cookie: 'rt_consent=v1.all' })
    expect(r.appended).toEqual([])
    expect(r.dataLayer).toEqual([])
  })

  it('exposes enable/disable for a mid-session change of mind', () => {
    const r = run({ cookie: '' })
    expect(typeof r.win['__tsGa'].enable).toBe('function')
    expect(typeof r.win['__tsGa'].disable).toBe('function')
    r.win['__tsGa'].enable()
    expect(r.appended).toHaveLength(1)
    expect(r.dataLayer.filter(a => a[0] === 'config')).toHaveLength(1)
    r.win['__tsGa'].enable()
    expect(r.appended).toHaveLength(1)
    expect(r.dataLayer.filter(a => a[0] === 'config')).toHaveLength(1)
    r.win['__tsGa'].disable()
    expect(r.win['ga-disable-G-CDWQYHC2Z3']).toBe(true)
  })

  it('off production the hook is absent, so enable cannot load GA', () => {
    const r = run({ hostname: 'localhost' })
    expect(r.win['__tsGa']).toBeUndefined()
  })
})
