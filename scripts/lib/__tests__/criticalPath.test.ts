import { describe, it, expect } from 'vitest'
import {
  chunkName,
  criticalPathChunks,
  forbiddenOnCriticalPath,
  htmlCriticalRoots,
  ROUTE_ONLY_CHUNK_PREFIXES,
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
