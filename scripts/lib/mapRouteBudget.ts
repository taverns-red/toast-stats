/**
 * mapRouteBudget — the map-route JS budget (#1786, ADR-016 D2).
 *
 * Ron decided this on 2026-10-12. It applies to map routes only, gzip, and
 * is enforced in CI:
 * - main-thread JS ≤ 300 KB;
 * - the MapLibre worker ≤ 150 KB.
 *
 * A map route is any built chunk that lazy-imports the `BasemapMap-*.js`
 * chunk (today the page chunk that holds LazyBasemapMap). Its main-thread
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
  const entries = assetNames.filter(
    n => n.endsWith('.js') && n !== basemap && lazyEdge.test(read(n) ?? '')
  )

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
