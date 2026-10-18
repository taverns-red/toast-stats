import { describe, it, expect } from 'vitest'
import { gzipSync } from 'node:zlib'
import { randomBytes } from 'node:crypto'
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

// Incompressible payloads: random bytes, so gzip size ≈ raw size.
function noise(n: number): string {
  return randomBytes(n).toString('latin1')
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

  it('charges each page that reaches a shared lazy-map chunk, not the shared chunk (#1808)', () => {
    // Two map pages (district #1784, region #1808): Vite hoists the shared
    // LazyBasemapMap into its own chunk, which both pages import statically.
    // The pages are the routes; the shared chunk alone would undercount them.
    const shared = `import{t}from"./vendor-j5mcA8oB.js";var s=lazy(()=>t(()=>import(\`./BasemapMap-z69xyLVV.js\`)));`
    const files: Record<string, string> = {
      // The app's router lazy-imports each page (App.tsx React.lazy).
      'index-B6US2pDD.js': `import"./vendor-j5mcA8oB.js";var a=lazy(()=>t(()=>import(\`./DistrictMapPage-D1.js\`))),b=lazy(()=>t(()=>import(\`./RegionMapPage-R1.js\`)));`,
      'vendor-j5mcA8oB.js': 'x'.repeat(50_000),
      'districtMap-Abc123.js': shared,
      // A page's own on-demand chunk that reuses the shared chunk is part of
      // that page, not a route of its own.
      'RegionClubList-L1.js': `import{s}from"./districtMap-Abc123.js";`,
      'DistrictMapPage-D1.js': `import{s}from"./districtMap-Abc123.js";${'d'.repeat(20)}`,
      'RegionMapPage-R1.js': `import{s}from"./districtMap-Abc123.js";import{p}from"./pinExtended-P1.js";`,
      'pinExtended-P1.js': 'p'.repeat(30),
      'BasemapMap-z69xyLVV.js': `import{a}from"./maplibre-CviuKSG-.js";`,
      'maplibre-CviuKSG-.js': 'm'.repeat(10),
      'maplibre-gl-worker-DxGNRm0a.mjs': 'w',
    }
    const read = (n: string) => files[n] ?? null
    const r = mapRouteBudgetReport(INDEX_HTML, Object.keys(files), read)
    expect(r.routes.map(x => x.entry).sort()).toEqual([
      'DistrictMapPage-D1.js',
      'RegionMapPage-R1.js',
    ])
    const region = r.routes.find(x => x.entry === 'RegionMapPage-R1.js')!
    expect(region.chunks).toEqual([
      'BasemapMap-z69xyLVV.js',
      'RegionMapPage-R1.js',
      'districtMap-Abc123.js',
      'maplibre-CviuKSG-.js',
      'pinExtended-P1.js',
    ])

    const heavy = (n: string) =>
      n === 'pinExtended-P1.js' ? noise(310 * 1024) : read(n)
    expect(
      mapRouteBudgetReport(INDEX_HTML, Object.keys(files), heavy).violations
    ).toEqual([expect.stringMatching(/^RegionMapPage-R1\.js: main-thread/)])
  })

  it('flags a route over 300 KB of main-thread gzip', () => {
    const { html, names, read } = build({
      page: 10,
      map: 10,
      maplibre: 10,
      worker: 10,
    })
    const big = (n: string) =>
      n === 'maplibre-CviuKSG-.js' ? noise(310 * 1024) : read(n)
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
      n === 'maplibre-gl-worker-DxGNRm0a.mjs' ? noise(155 * 1024) : read(n)
    const r = mapRouteBudgetReport(html, names, big)
    expect(r.violations).toEqual([expect.stringMatching(/worker .* > 153600/)])
  })

  it('is not vacuous: a build with no BasemapMap chunk is a violation', () => {
    const r = mapRouteBudgetReport(INDEX_HTML, ['index-B6US2pDD.js'], () => '')
    expect(r.violations).toEqual([expect.stringMatching(/no BasemapMap chunk/)])
  })
})
