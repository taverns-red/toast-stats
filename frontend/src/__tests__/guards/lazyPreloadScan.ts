/* Lazy-page preload scanner (#2248).

   A test that renders a page through its own `React.lazy(() => import(X))`
   pays Vite's cold transform of X's whole module graph on first render, and
   that cost lands inside the first test's 1 s `findBy` window. On a slow CI
   runner (~4x) the transform alone overruns the window: 7 of the 10 failures
   in main run 39847333836 were the first test of such a file, stuck on the
   Suspense fallback. The fix is to import X in a `beforeAll` (as
   DistrictMapPage.test.tsx already did), so the hook pays the compile and the
   window measures the page. This scanner finds the files that don't. */

const LAZY_IMPORT =
  /\blazy\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g
const DYNAMIC_IMPORT = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

/** Modules a test source wraps in a test-local `React.lazy`. */
export function lazyImportTargets(source: string): string[] {
  return [...new Set([...source.matchAll(LAZY_IMPORT)].map(m => m[1]!))]
}

/** The bodies of a test source's top-level `beforeAll` hooks. */
export function beforeAllBodies(source: string): string[] {
  return [...source.matchAll(/^beforeAll\(/gm)].map(start => {
    // A top-level hook closes on the first line that starts with `}`.
    const rest = source.slice(start.index)
    const end = rest.search(/\n\}/)
    return end === -1 ? rest : rest.slice(0, end)
  })
}

/** Modules a test source imports inside a top-level `beforeAll` body. */
export function preloadedModules(source: string): Set<string> {
  const preloaded = new Set<string>()
  for (const body of beforeAllBodies(source)) {
    for (const m of body.matchAll(DYNAMIC_IMPORT)) preloaded.add(m[1]!)
  }
  return preloaded
}

/** Lazy-wrapped modules the test source never preloads in a `beforeAll`. */
export function missingPreloads(source: string): string[] {
  const preloaded = preloadedModules(source)
  return lazyImportTargets(source).filter(target => !preloaded.has(target))
}
