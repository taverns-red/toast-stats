/* Every test that renders <App /> preloads its lazy route graph (#2373).

   The synthetic cases prove the scanner fires; the census holds the repo to
   it. See appRouteScan.ts for why the preload matters. */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  APP_ENTRY,
  lazyModuleGraph,
  missesRoutePreload,
  rendersAppRoutes,
} from './appRouteScan'

const journey = [
  "import App from '../../../App'",
  "it('x', async () => { render(<App />) })",
].join('\n')

const preloaded = [
  "import App from '../../../App'",
  "import { preloadAppRoutes } from '../utils/preloadAppRoutes'",
  'beforeAll(async () => {',
  '  await preloadAppRoutes()',
  '}, 60_000)',
  "it('x', async () => { render(<App />) })",
].join('\n')

describe('appRouteScan — fires on a journey with no route preload', () => {
  it('sees a static and a dynamic import of App', () => {
    expect(rendersAppRoutes(journey)).toBe(true)
    expect(
      rendersAppRoutes("const { default: App } = await import('../../App')")
    ).toBe(true)
    expect(rendersAppRoutes("import AppShell from '../AppShell'")).toBe(false)
  })

  it('reports a journey with no beforeAll', () => {
    expect(missesRoutePreload(journey)).toBe(true)
  })

  it('reports a hand-kept preload list that skips the helper', () => {
    const src = [
      journey,
      'beforeAll(async () => {',
      "  await import('../../../pages/DistrictDetailPage')",
      '})',
    ].join('\n')
    expect(missesRoutePreload(src)).toBe(true)
  })

  it('does not count a preload outside the hook', () => {
    const src = [
      journey,
      'beforeAll(() => {',
      '  setup()',
      '})',
      "it('y', async () => { await preloadAppRoutes() })",
    ].join('\n')
    expect(missesRoutePreload(src)).toBe(true)
  })

  it('passes a journey that preloads through the helper', () => {
    expect(missesRoutePreload(preloaded)).toBe(false)
  })
})

describe('lazyModuleGraph — derived from App.tsx, not a list', () => {
  const graph = lazyModuleGraph()
  const appSource = readFileSync(APP_ENTRY, 'utf8')

  it('covers every lazy route page in App.tsx', () => {
    const pages = [...appSource.matchAll(/import\('\.\/pages\/(\w+)'\)/g)]
    expect(pages.length).toBeGreaterThan(30)
    for (const [, name] of pages) {
      expect(graph.some(f => f.endsWith(`/pages/${name}.tsx`))).toBe(true)
    }
  })

  it('follows lazy chunks inside the route pages', () => {
    // DistrictDetailPage lazy-loads its rankings tab (journey 01 used to
    // list it by hand).
    expect(
      graph.some(f => f.endsWith('/components/GlobalRankingsTab.tsx'))
    ).toBe(true)
  })
})

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('census: tests that render App preload its lazy routes', () => {
  it('every test that imports App calls preloadAppRoutes in a beforeAll', () => {
    const offenders = readdirSync(srcDir, { recursive: true })
      .map(String)
      .filter(f => /\.test\.tsx?$/.test(f))
      .filter(f => !f.endsWith('appRoutePreload.test.ts'))
      .filter(f => missesRoutePreload(readFileSync(join(srcDir, f), 'utf8')))
    expect(offenders).toEqual([])
  })
})
