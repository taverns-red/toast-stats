#!/usr/bin/env tsx
/**
 * check-critical-path — fail the build when a route-only chunk is on every
 * route's critical path (#1830, mobile epic #1827).
 *
 * Usage (after `npm run build:frontend`):
 *   npx tsx scripts/check-critical-path.ts [distDir]
 *
 * Prints the critical-path chunks with their gzip sizes as JSON on stdout
 * (R4: diagnostics on stderr) and exits 1 when a route-only chunk (`ROUTE_ONLY_CHUNK_PREFIXES`:
 * Recharts `charts-*`, MapLibre `maplibre-*`) is reachable from index.html without a dynamic import,
 * or from a chartless Lighthouse route's page chunk (`CHARTLESS_ROUTE_CHUNK_PREFIXES`) the same way.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import {
  criticalPathChunks,
  forbiddenOnCriticalPath,
  ROUTE_ONLY_CHUNK_PREFIXES,
  routeOnlyChunksOnChartlessRoutes,
} from './lib/criticalPath'

const dist = resolve(process.argv[2] ?? 'frontend/dist')
const indexPath = join(dist, 'index.html')
if (!existsSync(indexPath)) {
  console.error(`check-critical-path: ${indexPath} not found — build first`)
  process.exit(2)
}

const html = readFileSync(indexPath, 'utf-8')
const read = (name: string): string | null => {
  const p = join(dist, 'assets', name)
  return existsSync(p) ? readFileSync(p, 'utf-8') : null
}

const chunks = criticalPathChunks(html, read)
const sized = chunks.map(name => {
  const src = read(name)
  return { name, gzipBytes: src === null ? 0 : gzipSync(src).length }
})
const totalGzipBytes = sized.reduce((n, c) => n + c.gzipBytes, 0)
const forbidden = forbiddenOnCriticalPath(chunks, ROUTE_ONLY_CHUNK_PREFIXES)
const chartlessRoutes = routeOnlyChunksOnChartlessRoutes(
  readdirSync(join(dist, 'assets')),
  read
)

process.stdout.write(
  JSON.stringify(
    { chunks: sized, totalGzipBytes, forbidden, chartlessRoutes },
    null,
    2
  ) + '\n'
)

let failed = false
if (forbidden.length > 0) {
  console.error(
    `check-critical-path: route-only chunk(s) on every route's critical path: ${forbidden.join(', ')}`
  )
  failed = true
}
for (const v of chartlessRoutes.violations) {
  console.error(`check-critical-path: chartless route ${v}`)
  failed = true
}
for (const m of chartlessRoutes.missing) {
  console.error(
    `check-critical-path: no ${m}*.js chunk in the build; the chartless-route check would be vacuous`
  )
  failed = true
}
if (failed) process.exit(1)
console.error(
  `check-critical-path: OK — ${chunks.length} critical chunks, ${Math.round(totalGzipBytes / 1024)} KB gzip`
)
