/* Stale-build chunk-load recovery (#2415).
 *
 * After a deploy, a tab on the previous build asks for a content-hashed chunk
 * that no longer exists. These tests pin the three pieces of the self-heal:
 *   - the classifier that recognises a chunk-load failure across browsers,
 *   - the sessionStorage guard that allows one automatic reload per target in
 *     a short window (so a chunk that is still broken can never loop), and
 *   - the reload itself, which goes to the URL the user was navigating to.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  isChunkLoadError,
  claimChunkReload,
  reloadTo,
  CHUNK_RELOAD_WINDOW_MS,
  installChunkReloadHandler,
  isBuildStale,
} from '../chunkReload'

/** A Storage-shaped in-memory store (the guard only needs get/set). */
function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const data = new Map<string, string>()
  return {
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  }
}

describe('isChunkLoadError (#2415)', () => {
  // The messages each engine rejects a failed dynamic import() with, plus the
  // MIME-type wording a stale chunk served as text/html produces.
  const chunkErrors: [string, unknown][] = [
    [
      'Chrome: failed fetch',
      new TypeError(
        'Failed to fetch dynamically imported module: https://ts.taverns.red/assets/DistrictClubsPage-deadbeef.js'
      ),
    ],
    [
      'Chrome: HTML served for a module',
      new TypeError(
        'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html". Strict MIME type checking is enforced for module scripts per HTML spec.'
      ),
    ],
    [
      'Firefox: failed import',
      new TypeError(
        'error loading dynamically imported module: https://ts.taverns.red/assets/DistrictClubsPage-deadbeef.js'
      ),
    ],
    [
      'Firefox: disallowed MIME type',
      new Error(
        'Loading module from “https://ts.taverns.red/assets/x-deadbeef.js” was blocked because of a disallowed MIME type (“text/html”).'
      ),
    ],
    [
      'Safari: failed import',
      new TypeError('Importing a module script failed.'),
    ],
    [
      'Safari: HTML served for a module',
      new TypeError("'text/html' is not a valid JavaScript MIME type."),
    ],
    [
      'Vite: CSS preload failed',
      new Error(
        'Unable to preload CSS for /assets/DistrictClubsPage-deadbeef.css'
      ),
    ],
  ]

  for (const [label, err] of chunkErrors) {
    it(`recognises ${label}`, () => {
      expect(isChunkLoadError(err)).toBe(true)
    })
  }

  it('recognises a bare message string', () => {
    expect(isChunkLoadError('Importing a module script failed.')).toBe(true)
  })

  const otherErrors: [string, unknown][] = [
    ['a render error', new Error('kaboom from a child route')],
    [
      'a TypeError from code',
      new TypeError("Cannot read properties of undefined (reading 'id')"),
    ],
    ['a network data fetch', new TypeError('Failed to fetch')],
    ['a 404 Response', new Response(null, { status: 404 })],
    ['null', null],
    ['undefined', undefined],
  ]

  for (const [label, err] of otherErrors) {
    it(`does not classify ${label} as a chunk error`, () => {
      expect(isChunkLoadError(err)).toBe(false)
    })
  }
})

describe('claimChunkReload guard (#2415)', () => {
  const target = 'https://ts.taverns.red/district/61/clubs'

  it('allows one reload for a target, then refuses the next', () => {
    const storage = memoryStorage()
    expect(claimChunkReload(target, { storage, now: () => 1000 })).toBe(true)
    expect(claimChunkReload(target, { storage, now: () => 2000 })).toBe(false)
  })

  it('allows a reload again once the window has passed', () => {
    const storage = memoryStorage()
    expect(claimChunkReload(target, { storage, now: () => 0 })).toBe(true)
    expect(
      claimChunkReload(target, {
        storage,
        now: () => CHUNK_RELOAD_WINDOW_MS + 1,
      })
    ).toBe(true)
  })

  it('tracks each target separately', () => {
    const storage = memoryStorage()
    expect(claimChunkReload(target, { storage, now: () => 0 })).toBe(true)
    expect(
      claimChunkReload('https://ts.taverns.red/district/61/map', {
        storage,
        now: () => 1,
      })
    ).toBe(true)
  })

  it('refuses to reload when sessionStorage throws (no guard, no reload)', () => {
    const storage = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      },
    }
    expect(claimChunkReload(target, { storage, now: () => 0 })).toBe(false)
  })

  it('recovers from a corrupt stored value', () => {
    const storage = memoryStorage()
    storage.setItem('ts:chunk-reload', '{not json')
    expect(claimChunkReload(target, { storage, now: () => 0 })).toBe(true)
  })
})

describe('reloadTo (#2415)', () => {
  function fakeLocation(href: string) {
    return { href, reload: vi.fn(), assign: vi.fn() }
  }

  it('reloads in place when the target is the current URL (keeps history state)', () => {
    const loc = fakeLocation('https://ts.taverns.red/district/61/clubs#top')
    reloadTo('https://ts.taverns.red/district/61/clubs#top', loc)
    expect(loc.reload).toHaveBeenCalledTimes(1)
    expect(loc.assign).not.toHaveBeenCalled()
  })

  it('navigates to the target when it differs from the current URL', () => {
    const loc = fakeLocation('https://ts.taverns.red/')
    reloadTo('https://ts.taverns.red/district/61/clubs?py=2026-2027', loc)
    expect(loc.assign).toHaveBeenCalledWith(
      'https://ts.taverns.red/district/61/clubs?py=2026-2027'
    )
    expect(loc.reload).not.toHaveBeenCalled()
  })
})

describe('isBuildStale (#2415)', () => {
  /** A document whose module entry script is `src`. */
  function docWithEntry(src: string | null): Document {
    const doc = document.implementation.createHTMLDocument('t')
    const inline = doc.createElement('script')
    inline.textContent = 'window.x = 1'
    doc.head.appendChild(inline)
    if (src) {
      const s = doc.createElement('script')
      s.type = 'module'
      s.src = src
      doc.head.appendChild(s)
    }
    return doc
  }
  const html = (src: string) =>
    `<!doctype html><html><head><script>1</script><script type="module" crossorigin src="${src}"></script></head><body></body></html>`
  const fetchOk = (body: string) =>
    vi.fn(async () => new Response(body, { status: 200 }))

  it('is true when the deployed entry script differs from the running one', async () => {
    const fetchImpl = fetchOk(html('/assets/index-NEW.js'))
    await expect(
      isBuildStale({ fetchImpl, doc: docWithEntry('/assets/index-OLD.js') })
    ).resolves.toBe(true)
    // Fresh copy of the HTML, never the HTTP cache.
    expect(fetchImpl).toHaveBeenCalledWith(
      '/',
      expect.objectContaining({ cache: 'no-store' })
    )
  })

  it('is false when the deployed build is the running build', async () => {
    await expect(
      isBuildStale({
        fetchImpl: fetchOk(html('/assets/index-SAME.js')),
        doc: docWithEntry('/assets/index-SAME.js'),
      })
    ).resolves.toBe(false)
  })

  it('is false when the HTML cannot be fetched', async () => {
    await expect(
      isBuildStale({
        fetchImpl: vi.fn(async () => {
          throw new TypeError('Load failed')
        }),
        doc: docWithEntry('/assets/index-OLD.js'),
      })
    ).resolves.toBe(false)
    await expect(
      isBuildStale({
        fetchImpl: vi.fn(async () => new Response('', { status: 503 })),
        doc: docWithEntry('/assets/index-OLD.js'),
      })
    ).resolves.toBe(false)
  })

  it('is false when either entry script is unknown', async () => {
    await expect(
      isBuildStale({
        fetchImpl: fetchOk(html('/assets/index-NEW.js')),
        doc: docWithEntry(null),
      })
    ).resolves.toBe(false)
    await expect(
      isBuildStale({
        fetchImpl: fetchOk('<html><body>no scripts</body></html>'),
        doc: docWithEntry('/assets/index-OLD.js'),
      })
    ).resolves.toBe(false)
  })
})

describe('installChunkReloadHandler (vite:preloadError) (#2415)', () => {
  function preloadError(payload: unknown): Event {
    const e = new Event('vite:preloadError', { cancelable: true })
    ;(e as Event & { payload: unknown }).payload = payload
    return e
  }
  const chunkErr = () =>
    new TypeError(
      'Failed to fetch dynamically imported module: https://ts.taverns.red/assets/a-1.js'
    )
  /** Let the handler's async stale-build check settle. */
  const settle = () => new Promise(r => setTimeout(r, 0))

  function install(
    target: EventTarget,
    stale: boolean,
    href = 'https://ts.taverns.red/district/61/clubs'
  ) {
    const reload = vi.fn()
    const isBuildStale = vi.fn(async () => stale)
    const uninstall = installChunkReloadHandler(target, {
      storage: memoryStorage(),
      now: () => 0,
      currentHref: () => href,
      reload,
      isBuildStale,
    })
    return { reload, isBuildStale, uninstall }
  }

  it('reloads the current URL once when the build is stale, then stops', async () => {
    const target = new EventTarget()
    const { reload, uninstall } = install(target, true)
    target.dispatchEvent(preloadError(chunkErr()))
    await settle()
    target.dispatchEvent(preloadError(chunkErr()))
    await settle()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledWith(
      'https://ts.taverns.red/district/61/clubs'
    )
    uninstall()
  })

  // WebKit aborts in-flight preloads when a navigation starts and fires their
  // error events ("Unable to preload CSS for …"), on the SAME build. A reload
  // of the old URL then hijacks the navigation the user just started.
  it('does not reload a chunk error when the build has not changed', async () => {
    const target = new EventTarget()
    const { reload, isBuildStale, uninstall } = install(target, false)
    target.dispatchEvent(
      preloadError(
        new Error(
          'Unable to preload CSS for https://ts.taverns.red/assets/pinFeatures-CLDMVitk.css'
        )
      )
    )
    await settle()
    expect(isBuildStale).toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    uninstall()
  })

  it('does not reload once the page has started to unload', async () => {
    const target = new EventTarget()
    const { reload, isBuildStale, uninstall } = install(target, true)
    target.dispatchEvent(new Event('beforeunload'))
    target.dispatchEvent(preloadError(chunkErr()))
    await settle()
    expect(isBuildStale).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    uninstall()
  })

  it('does not reload when unload starts during the stale-build check', async () => {
    const target = new EventTarget()
    const { reload, uninstall } = install(target, true)
    target.dispatchEvent(preloadError(chunkErr()))
    target.dispatchEvent(new Event('pagehide'))
    await settle()
    expect(reload).not.toHaveBeenCalled()
    uninstall()
  })

  it('reloads again after a back/forward-cache restore (pageshow)', async () => {
    const target = new EventTarget()
    const { reload, uninstall } = install(target, true)
    target.dispatchEvent(new Event('pagehide'))
    target.dispatchEvent(new Event('pageshow'))
    target.dispatchEvent(preloadError(chunkErr()))
    await settle()
    expect(reload).toHaveBeenCalledTimes(1)
    uninstall()
  })

  it('ignores a preload error that is not a chunk-load failure', async () => {
    const target = new EventTarget()
    const { reload, uninstall } = install(target, true)
    target.dispatchEvent(preloadError(new Error('kaboom at module top level')))
    await settle()
    expect(reload).not.toHaveBeenCalled()
    uninstall()
  })
})
