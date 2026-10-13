import { describe, it, expect } from 'vitest'
import {
  CHARTLESS_ROUTE_CHUNK_PREFIXES,
  chunkName,
  criticalPathChunks,
  forbiddenOnCriticalPath,
  htmlCriticalRoots,
  ROUTE_ONLY_CHUNK_PREFIXES,
  routeOnlyChunksOnChartlessRoutes,
  staticImports,
} from '../criticalPath'

// Shapes copied from a real `vite build` (Vite 8 / rolldown) of frontend/:
// minified ESM with no whitespace, `/assets/` hrefs in index.html, `./` specifiers
// between chunks, and `__vitePreload(()=>import("./x.js"),…)` for lazy routes.
const INDEX_HTML = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/index-B7NASX-P.js"></script>
<link rel="modulepreload" crossorigin href="/assets/vendor-dk9coiy2.js">
<link rel="modulepreload" crossorigin href="/assets/query-ThhTlqCA.js">
<link rel="stylesheet" crossorigin href="/assets/index-abc.css">
</head><body><div id="root"></div></body></html>`

const CHUNKS: Record<string, string> = {
  'index-B7NASX-P.js': `import{n as e}from"./vendor-dk9coiy2.js";import"./query-ThhTlqCA.js";const D=s(()=>__vitePreload(()=>import("./DistrictsPage-x.js"),__vite__mapDeps([0,1])));`,
  'vendor-dk9coiy2.js': `var r=1;export{r as _};`,
  'query-ThhTlqCA.js': `import{_ as t}from"./vendor-dk9coiy2.js";export{t as q};`,
  'DistrictsPage-x.js': `import{a as n}from"./charts-xzsG-m48.js";`,
  'charts-xzsG-m48.js': `export{a};`,
}
const read = (name: string) => CHUNKS[name] ?? null

describe('criticalPath (#1830)', () => {
  it('normalises hrefs and specifiers to bare chunk names', () => {
    expect(chunkName('/assets/index-B7NASX-P.js')).toBe('index-B7NASX-P.js')
    expect(chunkName('./charts-xzsG-m48.js')).toBe('charts-xzsG-m48.js')
    expect(chunkName('/assets/a.js?v=1')).toBe('a.js')
  })

  it('takes the entry module and every modulepreload as roots, not stylesheets', () => {
    expect(htmlCriticalRoots(INDEX_HTML).sort()).toEqual([
      'index-B7NASX-P.js',
      'query-ThhTlqCA.js',
      'vendor-dk9coiy2.js',
    ])
  })

  it('follows static imports but not dynamic import()', () => {
    expect(staticImports(CHUNKS['index-B7NASX-P.js']!).sort()).toEqual([
      'query-ThhTlqCA.js',
      'vendor-dk9coiy2.js',
    ])
  })

  it('keeps a chunk reached only through a lazy route off the critical path', () => {
    const chunks = criticalPathChunks(INDEX_HTML, read)
    expect(chunks).toEqual([
      'index-B7NASX-P.js',
      'query-ThhTlqCA.js',
      'vendor-dk9coiy2.js',
    ])
    expect(forbiddenOnCriticalPath(chunks, ['charts-'])).toEqual([])
  })

  it('flags charts when a critical chunk imports it statically', () => {
    const leaky = {
      ...CHUNKS,
      'vendor-dk9coiy2.js': `import{_ as e}from"./charts-xzsG-m48.js";`,
    }
    const chunks = criticalPathChunks(INDEX_HTML, n => leaky[n] ?? null)
    expect(forbiddenOnCriticalPath(chunks, ['charts-'])).toEqual([
      'charts-xzsG-m48.js',
    ])
  })

  it('flags charts when index.html modulepreloads it', () => {
    const html = INDEX_HTML.replace(
      '</head>',
      '<link rel="modulepreload" crossorigin href="/assets/charts-xzsG-m48.js"></head>'
    )
    expect(
      forbiddenOnCriticalPath(criticalPathChunks(html, read), ['charts-'])
    ).toEqual(['charts-xzsG-m48.js'])
  })
})

describe('ROUTE_ONLY_CHUNK_PREFIXES (#1786)', () => {
  it('keeps the MapLibre basemap chunk off every route’s critical path', () => {
    expect(ROUTE_ONLY_CHUNK_PREFIXES).toEqual(
      expect.arrayContaining(['charts-', 'maplibre-'])
    )
  })
})

describe('chartless routes (#1830)', () => {
  // Real shape from the 2026-10-13 build: DistrictClubsPage imported ONE
  // binding (`use-sync-external-store/with-selector`, via @tanstack/react-table
  // v9 → react-store) from the Recharts chunk, so the clubs route downloaded
  // 112 KB gzip of Recharts while rendering no Recharts chart.
  const ROUTE_CHUNKS: Record<string, string> = {
    ...CHUNKS,
    'DistrictClubsPage-DHeEmF1E.js': `import{t as e}from"./vendor-dk9coiy2.js";import{m as ie}from"./charts-BW5-qXEF.js";const L=s(()=>__vitePreload(()=>import("./RaceChart-a.js"),[]));`,
    'charts-BW5-qXEF.js': `import{_ as t}from"./vendor-dk9coiy2.js";export{lr as m};`,
    'RaceChart-a.js': `import{a}from"./charts-BW5-qXEF.js";`,
    'RegionsPage-Cu6GA-ct.js': `import{t as e}from"./vendor-dk9coiy2.js";`,
  }
  const names = Object.keys(ROUTE_CHUNKS)
  const readRoute = (n: string) => ROUTE_CHUNKS[n] ?? null

  it('names the five Lighthouse mobile routes, none of which renders Recharts at first paint', () => {
    expect([...CHARTLESS_ROUTE_CHUNK_PREFIXES].sort()).toEqual([
      'ClubDetailPage-',
      'DistrictClubsPage-',
      'DistrictDetailPage-',
      'DistrictsPage-',
      'RegionsPage-',
    ])
  })

  it('flags a route-only chunk a chartless route reaches through a static import', () => {
    expect(
      routeOnlyChunksOnChartlessRoutes(names, readRoute, ['DistrictClubsPage-'])
    ).toEqual({
      violations: [
        'DistrictClubsPage-DHeEmF1E.js statically imports charts-BW5-qXEF.js',
      ],
      missing: [],
    })
  })

  it('does not count a lazy import() edge, and passes a clean route', () => {
    expect(
      routeOnlyChunksOnChartlessRoutes(names, readRoute, ['RegionsPage-'])
    ).toEqual({ violations: [], missing: [] })
  })

  it('reports a listed route with no chunk in the build, so the check is never vacuous', () => {
    expect(
      routeOnlyChunksOnChartlessRoutes(names, readRoute, ['GonePage-'])
    ).toEqual({ violations: [], missing: ['GonePage-'] })
  })
})
