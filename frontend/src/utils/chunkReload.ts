/**
 * Stale-build chunk-load recovery (#2415).
 *
 * Routes are `React.lazy` chunks with content-hashed names. A deploy removes
 * the previous build's chunks, so a tab still running that build fails the
 * moment it navigates to a route whose chunk it has not loaded yet. The fix is
 * one full reload of the URL the user was going to, which fetches the new
 * build's index.html and its new chunk names.
 *
 * Two paths reach here:
 *   - Vite's `vite:preloadError` window event. Vite's preload helper dispatches
 *     it (cancelable, the original error on `event.payload`) when a preloaded
 *     dependency or the dynamic import itself rejects; unless the event is
 *     default-prevented, the error is then rethrown to the caller. We do not
 *     prevent it: if no reload happens, the rejection still reaches the
 *     router's errorElement and the user sees the error page.
 *   - The router's errorElement (`ErrorPage`), for a dynamic-import rejection
 *     that surfaces as a render error.
 *
 * A chunk error is not proof of a stale build: WebKit aborts in-flight
 * preloads as a navigation starts and fires their error events, on the build
 * that is still deployed. So both paths go through `recoverFromChunkError`,
 * which reloads only when the page is not unloading AND a fresh copy of the
 * HTML names a different entry script than the running one (`isBuildStale`).
 *
 * It then claims `claimChunkReload`, a sessionStorage guard that allows one
 * automatic reload per target URL within `CHUNK_RELOAD_WINDOW_MS`. If the
 * chunk still fails after that reload, the guard refuses and the error page
 * shows a manual Reload instead of looping. If sessionStorage is unavailable
 * the guard refuses too: without it we cannot prove we are not looping.
 */

type GuardStorage = Pick<Storage, 'getItem' | 'setItem'>

export interface ChunkReloadDeps {
  storage?: GuardStorage
  now?: () => number
}

/** A reload for the same target inside this window is treated as a loop. */
export const CHUNK_RELOAD_WINDOW_MS = 60_000

const STORAGE_KEY = 'ts:chunk-reload'

/**
 * Messages a failed dynamic `import()` or module preload rejects with:
 *   - Chrome: "Failed to fetch dynamically imported module: <url>", and the
 *     "Expected a JavaScript(-or-Wasm) module script … MIME type" wording;
 *   - Firefox: "error loading dynamically imported module: <url>", and the
 *     "disallowed MIME type" wording;
 *   - Safari: "Importing a module script failed.", and
 *     "'text/html' is not a valid JavaScript MIME type.";
 *   - Vite's preload helper: "Unable to preload CSS for <url>".
 */
const CHUNK_ERROR_PATTERNS: RegExp[] = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /expected a javascript(-or-wasm)? module script/i,
  /is not a valid javascript mime type/i,
  /disallowed mime type/i,
  /unable to preload css/i,
]

function messageOf(err: unknown): string | null {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  if (
    err !== null &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  ) {
    return (err as { message: string }).message
  }
  return null
}

/** True when `err` is a stale-build chunk/preload load failure. */
export function isChunkLoadError(err: unknown): boolean {
  const message = messageOf(err)
  if (!message) return false
  return CHUNK_ERROR_PATTERNS.some(p => p.test(message))
}

function defaultStorage(): GuardStorage | undefined {
  try {
    return window.sessionStorage
  } catch {
    return undefined
  }
}

/**
 * Record an automatic reload for `target` and return true, or return false
 * when one already happened for it inside the window (or storage is
 * unavailable, so no guard is possible).
 */
export function claimChunkReload(
  target: string,
  deps: ChunkReloadDeps = {}
): boolean {
  const storage = deps.storage ?? defaultStorage()
  const now = (deps.now ?? Date.now)()
  if (!storage) return false
  try {
    let seen: Record<string, unknown> = {}
    const raw = storage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          seen = parsed as Record<string, unknown>
        }
      } catch {
        // A corrupt value is no evidence of a recent reload; start fresh.
      }
    }
    const recent = (at: unknown): at is number =>
      typeof at === 'number' && now - at <= CHUNK_RELOAD_WINDOW_MS
    if (recent(seen[target])) return false
    // Keep only entries still inside the window, plus this one.
    const kept: Record<string, number> = {}
    for (const [url, at] of Object.entries(seen)) {
      if (recent(at)) kept[url] = at
    }
    kept[target] = now
    storage.setItem(STORAGE_KEY, JSON.stringify(kept))
    return true
  } catch {
    return false
  }
}

/**
 * Full-page load of `target`. When it is the current URL, `reload()` it in
 * place: that keeps the history entry and its state (React Router keeps
 * `location.state` there), and it still reloads when the URL has a hash, which
 * `assign()` to the same URL would treat as an in-page jump.
 */
export function reloadTo(
  target: string,
  loc: Pick<Location, 'href' | 'reload' | 'assign'>
): void {
  if (loc.href === target) {
    loc.reload()
  } else {
    loc.assign(target)
  }
}

/** The entry module script's path in `doc`, or null when there is none. */
function entryScriptPath(doc: Document): string | null {
  const src = doc
    .querySelector('script[type="module"][src]')
    ?.getAttribute('src')
  if (!src) return null
  try {
    return new URL(src, window.location.origin).pathname
  } catch {
    return null
  }
}

/**
 * True only when a newer build is deployed than the one running: a fresh copy
 * of the app's HTML (`cache: 'no-store'`) names a different entry script than
 * this document does. Content hashes change with every build, so a different
 * entry name means the old chunk names are gone.
 *
 * Anything unknown (fetch failed, non-OK status, no entry script on either
 * side, as in dev) is "not stale": we don't reload on a guess. The error page
 * still offers a manual Reload.
 */
export async function isBuildStale(
  deps: { fetchImpl?: typeof fetch; doc?: Document } = {}
): Promise<boolean> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const running = entryScriptPath(deps.doc ?? document)
  if (!running) return false
  try {
    // `/` rather than `/index.html`: cleanUrls redirects the latter.
    const res = await fetchImpl('/', {
      cache: 'no-store',
      credentials: 'same-origin',
    })
    if (!res.ok) return false
    const deployedDoc = new DOMParser().parseFromString(
      await res.text(),
      'text/html'
    )
    const deployed = entryScriptPath(deployedDoc)
    return deployed !== null && deployed !== running
  } catch {
    return false
  }
}

/** The browser seams; tests spy on these. */
export const browserNav = {
  reloadTo: (target: string): void => reloadTo(target, window.location),
  isBuildStale: (): Promise<boolean> => isBuildStale(),
}

/**
 * Set from `beforeunload`/`pagehide` (and cleared on `pageshow`, a
 * back/forward-cache restore) by `installChunkReloadHandler`. Once the page
 * has started to unload, a chunk error is the browser aborting in-flight loads
 * for the navigation the user just started (WebKit fires the preload's error
 * event then); reloading the old URL would hijack that navigation.
 */
let leaving = false

interface RecoverDeps extends ChunkReloadDeps {
  isBuildStale?: () => Promise<boolean>
  reload?: (target: string) => void
}

/**
 * Reload `target` once, only if the page is not unloading, a newer build is
 * deployed, and the guard allows it. Resolves to whether it reloaded.
 */
export async function recoverFromChunkError(
  target: string,
  deps: RecoverDeps = {}
): Promise<boolean> {
  if (leaving) return false
  const stale = await (deps.isBuildStale ?? browserNav.isBuildStale)()
  // Re-check: an unload may have started while we fetched the HTML.
  if (!stale || leaving) return false
  if (!claimChunkReload(target, deps)) return false
  ;(deps.reload ?? browserNav.reloadTo)(target)
  return true
}

/**
 * Listen for `vite:preloadError` on `target` (the window in the app) and
 * reload the current URL once for a stale-chunk failure, through
 * `recoverFromChunkError`. Also tracks page unload for it. Returns an
 * uninstall function.
 *
 * There is no hover prefetch of route chunks, so a failed route import is for
 * the page being navigated to: React Router has already pushed the new URL by
 * the time the lazy route renders and starts its import. A failed in-page lazy
 * import (a chart, the map runtime) is for the current page too.
 */
export function installChunkReloadHandler(
  target: EventTarget,
  deps: RecoverDeps & { currentHref?: () => string } = {}
): () => void {
  const currentHref = deps.currentHref ?? (() => window.location.href)
  const onPreloadError = (event: Event): void => {
    const payload = (event as Event & { payload?: unknown }).payload
    if (!isChunkLoadError(payload)) return
    void recoverFromChunkError(currentHref(), deps)
  }
  const onLeave = (): void => {
    leaving = true
  }
  const onShow = (): void => {
    leaving = false
  }
  target.addEventListener('vite:preloadError', onPreloadError)
  target.addEventListener('beforeunload', onLeave)
  target.addEventListener('pagehide', onLeave)
  target.addEventListener('pageshow', onShow)
  return () => {
    target.removeEventListener('vite:preloadError', onPreloadError)
    target.removeEventListener('beforeunload', onLeave)
    target.removeEventListener('pagehide', onLeave)
    target.removeEventListener('pageshow', onShow)
    leaving = false
  }
}
