import { describe, it, expect } from 'vitest'
import { gzipSync } from 'node:zlib'
import { MAP_ROUTE_BUDGET, mapRouteBudgetReport } from '../mapRouteBudget'

/* #1786 — map-route budget, decided by Ron 2026-10-12: 300 KB gzip of
 * main-thread JS and 150 KB gzip for the MapLibre worker, map routes only.
 * Shapes copied from a real `vite build` (Vite 8 / rolldown): the page chunk
 * lazy-imports `BasemapMap-*.js` with a backtick specifier, which statically
 * imports the shared vendor chunk (on every route's critical path, so not
 * charged to the map route) and the `maplibre-*.js` group chunk. */

const INDEX_HTML = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/index-B6US2pDD.js"></script>
<link rel="modulepreload" crossorigin href="/assets/vendor-j5mcA8oB.js">
</head></html>`

function build(sizes: {
  page: number
  map: number
  maplibre: number
  worker: number
}) {
  const pad = (n: number) => 'x'.repeat(n)
  const files: Record<string, string> = {
    'index-B6US2pDD.js': `import"./vendor-j5mcA8oB.js";${pad(10)}`,
    'vendor-j5mcA8oB.js': pad(50_000),
    'BasemapPreviewPage-DB1XFZyP.js': `import{t}from"./vendor-j5mcA8oB.js";var s=lazy(()=>t(()=>import(\`./BasemapMap-z69xyLVV.js\`)));${pad(sizes.page)}`,
    'BasemapMap-z69xyLVV.js': `import{t}from"./vendor-j5mcA8oB.js";import{a}from"./maplibre-CviuKSG-.js";${pad(sizes.map)}`,
    'maplibre-CviuKSG-.js': pad(sizes.maplibre),
    'maplibre-gl-worker-DxGNRm0a.mjs': pad(sizes.worker),
    'DistrictsPage-x.js': `import"./vendor-j5mcA8oB.js";`,
  }
  return {
    html: INDEX_HTML,
    names: Object.keys(files),
    read: (n: string) => files[n] ?? null,
  }
}

// Incompressible-enough payloads: random bytes as latin1 so gzip ≈ raw.
function noise(n: number): string {
  let s = ''
  let x = 12345
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    s += String.fromCharCode(33 + (x % 90))
  }
  return s
}

describe('MAP_ROUTE_BUDGET', () => {
  it('is Ron’s 2026-10-12 decision: 300 KB main thread + 150 KB worker, gzip', () => {
    expect(MAP_ROUTE_BUDGET).toEqual({
      mainThreadGzipBytes: 300 * 1024,
      workerGzipBytes: 150 * 1024,
    })
  })
})

describe('mapRouteBudgetReport', () => {
  it('charges each map route its lazy closure, not the shared critical path', () => {
    const { html, names, read } = build({
      page: 10,
      map: 10,
      maplibre: 10,
      worker: 10,
    })
    const r = mapRouteBudgetReport(html, names, read)
    expect(r.routes).toHaveLength(1)
    const route = r.routes[0]!
    expect(route.entry).toBe('BasemapPreviewPage-DB1XFZyP.js')
    expect(route.chunks).toEqual([
      'BasemapMap-z69xyLVV.js',
      'BasemapPreviewPage-DB1XFZyP.js',
      'maplibre-CviuKSG-.js',
    ])
    expect(route.chunks).not.toContain('vendor-j5mcA8oB.js')
    const expected = route.chunks
      .map(c => gzipSync(read(c)!).length)
      .reduce((a, b) => a + b, 0)
    expect(route.mainThreadGzipBytes).toBe(expected)
    expect(r.worker?.name).toBe('maplibre-gl-worker-DxGNRm0a.mjs')
    expect(r.violations).toEqual([])
  })

  it('flags a route over 300 KB of main-thread gzip', () => {
    const { html, names, read } = build({
      page: 10,
      map: 10,
      maplibre: 10,
      worker: 10,
    })
    const big = (n: string) =>
      n === 'maplibre-CviuKSG-.js' ? noise(320 * 1024) : read(n)
    const r = mapRouteBudgetReport(html, names, big)
    expect(r.violations).toEqual([
      expect.stringMatching(
        /BasemapPreviewPage-DB1XFZyP\.js: main-thread .* > 307200/
      ),
    ])
  })

  it('flags a worker over 150 KB gzip', () => {
    const { html, names, read } = build({
      page: 10,
      map: 10,
      maplibre: 10,
      worker: 10,
    })
    const big = (n: string) =>
      n === 'maplibre-gl-worker-DxGNRm0a.mjs' ? noise(160 * 1024) : read(n)
    const r = mapRouteBudgetReport(html, names, big)
    expect(r.violations).toEqual([expect.stringMatching(/worker .* > 153600/)])
  })

  it('is not vacuous: a build with no BasemapMap chunk is a violation', () => {
    const r = mapRouteBudgetReport(INDEX_HTML, ['index-B6US2pDD.js'], () => '')
    expect(r.violations).toEqual([expect.stringMatching(/no BasemapMap chunk/)])
  })
})
