/* App-route preload scanner (#2373, follow-up to #2248).

   lazyPreloadScan.ts covers tests that wrap a page in their own React.lazy.
   A test that renders <App /> reaches pages through App.tsx's lazy route
   table instead, so the same cold compile lands inside its first findBy
   window. Rather than keep a per-test list of the routes a journey visits,
   the set is derived from App.tsx: every React.lazy target there, and every
   React.lazy target inside those modules, transitively. Tests that render
   <App /> preload that set through preloadAppRoutes() in a beforeAll. */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAllBodies, lazyImportTargets } from './lazyPreloadScan'

export const APP_ENTRY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'App.tsx'
)

const EXTENSIONS = ['.tsx', '.ts', '/index.tsx', '/index.ts']

/** The file a relative import specifier in `fromFile` resolves to. */
export function resolveRelative(fromFile: string, spec: string): string {
  const base = join(dirname(fromFile), spec)
  const hit = EXTENSIONS.map(ext => base + ext).find(f => existsSync(f))
  if (!hit) throw new Error(`cannot resolve ${spec} from ${fromFile}`)
  return hit
}

/** Every module reachable from `entry` through React.lazy, transitively. */
export function lazyModuleGraph(entry: string = APP_ENTRY): string[] {
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.shift()!
    for (const spec of lazyImportTargets(readFileSync(file, 'utf8'))) {
      const target = resolveRelative(file, spec)
      if (seen.has(target)) continue
      seen.add(target)
      queue.push(target)
    }
  }
  return [...seen]
}

const APP_STATIC_IMPORT = /\bfrom\s+['"](?:\.{1,2}\/)+App['"]/
const APP_DYNAMIC_IMPORT = /\bimport\(\s*['"](?:\.{1,2}\/)+App['"]\s*\)/

/** Whether a test source imports <App />, and so renders its route table. */
export function rendersAppRoutes(source: string): boolean {
  return APP_STATIC_IMPORT.test(source) || APP_DYNAMIC_IMPORT.test(source)
}

/** Whether a top-level beforeAll calls preloadAppRoutes(). */
export function preloadsAppRoutes(source: string): boolean {
  return beforeAllBodies(source).some(body => /\bpreloadAppRoutes\(/.test(body))
}

/** A test that renders App's routes without preloading their lazy pages. */
export function missesRoutePreload(source: string): boolean {
  return rendersAppRoutes(source) && !preloadsAppRoutes(source)
}
