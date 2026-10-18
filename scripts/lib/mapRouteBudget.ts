/**
 * mapRouteBudget — the map-route JS budget (#1786, ADR-016 D2).
 *
 * Ron decided this on 2026-10-12. It applies to map routes only, gzip, and
 * is enforced in CI:
 * - main-thread JS ≤ 300 KB;
 * - the MapLibre worker ≤ 150 KB.
 *
 * A map route is a route chunk (one the critical path lazy-imports) whose
 * static closure holds the lazy import of the `BasemapMap-*.js` chunk —
 * the import LazyBasemapMap makes. Once two map pages share LazyBasemapMap
 * (district #1784, region #1808) Vite hoists it into a shared chunk, and
 * each page is charged through it; the shared chunk is never measured
 * alone, which would undercount every page. A lazy-import chunk no route
 * reaches is its own route, so the check is never vacuous. Its main-thread
 * cost is every chunk statically reachable from that entry or from
 * BasemapMap, minus the chunks already on every route's critical path. Those
 * are paid by the landing page and are guarded by the Lighthouse budget, so
 * they are not charged twice. The worker is the `maplibre-gl-worker-*.mjs`
 * asset that BasemapMap hands to `setWorkerUrl`.
 */
import { gzipSync } from 'node:zlib'
import { criticalPathChunks, staticImports } from './criticalPath'

export const MAP_ROUTE_BUDGET = {
  mainThreadGzipBytes: 300 * 1024,
  workerGzipBytes: 150 * 1024,
} as const

const BASEMAP_CHUNK_RE = /^BasemapMap-[\w-]+\.js$/
const WORKER_RE = /^maplibre-gl-worker-[\w-]+\.mjs$/

export interface MapRoute {
  entry: string
  chunks: string[]
  mainThreadGzipBytes: number
}

export interface MapRouteBudgetReport {
  routes: MapRoute[]
  worker: { name: string; gzipBytes: number } | null
  violations: string[]
}

function closure(
  roots: readonly string[],
  read: (name: string) => string | null
): Set<string> {
  const seen = new Set<string>()
  const queue = [...roots]
  while (queue.length > 0) {
    const name = queue.shift() as string
    if (seen.has(name)) continue
    seen.add(name)
    const src = read(name)
    if (src === null) continue
    for (const dep of staticImports(src)) if (!seen.has(dep)) queue.push(dep)
  }
  return seen
}

const DYNAMIC_IMPORT_RE = /import\(\s*["'`]\.\/([\w.-]+\.js)["'`]\s*\)/g

/** The chunks a chunk lazy-imports (`import(\`./X.js\`)`). */
function dynamicImports(chunkSource: string): string[] {
  return [...chunkSource.matchAll(DYNAMIC_IMPORT_RE)].map(m => m[1]!)
}

const gz = (src: string | null): number =>
  src === null ? 0 : gzipSync(src).length

export function mapRouteBudgetReport(
  indexHtml: string,
  assetNames: readonly string[],
  read: (name: string) => string | null
): MapRouteBudgetReport {
  const violations: string[] = []
  const basemap = assetNames.find(n => BASEMAP_CHUNK_RE.test(n))
  const workerName = assetNames.find(n => WORKER_RE.test(n)) ?? null
  const worker = workerName
    ? { name: workerName, gzipBytes: gz(read(workerName)) }
    : null

  if (!basemap) {
    violations.push(
      'no BasemapMap chunk in the build; the budget would be vacuous'
    )
    return { routes: [], worker, violations }
  }

  const critical = new Set(criticalPathChunks(indexHtml, read))
  const lazyEdge = new RegExp(
    `import\\(\\s*["'\`]\\./${basemap.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'\`]`
  )
  const lazyEdges = new Set(
    assetNames.filter(
      n => n.endsWith('.js') && n !== basemap && lazyEdge.test(read(n) ?? '')
    )
  )
  const routeChunks = new Set(
    [...critical].flatMap(c => dynamicImports(read(c) ?? ''))
  )
  const entries = [...routeChunks].filter(
    n => n !== basemap && [...closure([n], read)].some(c => lazyEdges.has(c))
  )
  const covered = new Set(entries.flatMap(e => [...closure([e], read)]))
  for (const edge of lazyEdges) if (!covered.has(edge)) entries.push(edge)

  const routes: MapRoute[] = entries.map(entry => {
    const chunks = [...closure([entry, basemap], read)]
      .filter(c => !critical.has(c))
      .sort()
    const mainThreadGzipBytes = chunks.reduce((n, c) => n + gz(read(c)), 0)
    return { entry, chunks, mainThreadGzipBytes }
  })

  if (routes.length === 0) {
    violations.push(
      `no chunk lazy-imports ${basemap}; the budget would be vacuous`
    )
  }
  for (const r of routes) {
    if (r.mainThreadGzipBytes > MAP_ROUTE_BUDGET.mainThreadGzipBytes) {
      violations.push(
        `${r.entry}: main-thread ${r.mainThreadGzipBytes} B gzip > ${MAP_ROUTE_BUDGET.mainThreadGzipBytes}`
      )
    }
  }
  if (worker === null) {
    violations.push('no maplibre-gl-worker-*.mjs asset in the build')
  } else if (worker.gzipBytes > MAP_ROUTE_BUDGET.workerGzipBytes) {
    violations.push(
      `worker ${worker.name}: ${worker.gzipBytes} B gzip > ${MAP_ROUTE_BUDGET.workerGzipBytes}`
    )
  }
  return { routes, worker, violations }
}
