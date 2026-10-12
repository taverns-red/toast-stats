#!/usr/bin/env tsx
/**
 * check-map-route-budget — fail the build when a map route exceeds Ron's
 * 2026-10-12 budget (#1786, ADR-016 D2). The budget is 300 KB gzip of
 * main-thread JS plus 150 KB gzip for the MapLibre worker, on map routes only.
 *
 * Usage (after `npm run build:frontend`):
 *   npx tsx scripts/check-map-route-budget.ts [distDir]
 *
 * Prints the report as JSON on stdout. Diagnostics go to stderr (R4). Exits 1
 * on any violation, including a build with no map route, which would make
 * the check vacuous.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { mapRouteBudgetReport } from './lib/mapRouteBudget'

const dist = resolve(process.argv[2] ?? 'frontend/dist')
const indexPath = join(dist, 'index.html')
if (!existsSync(indexPath)) {
  console.error(`check-map-route-budget: ${indexPath} not found — build first`)
  process.exit(2)
}
const assets = join(dist, 'assets')
const names = readdirSync(assets)
const read = (name: string): string | null => {
  const p = join(assets, name)
  return existsSync(p) ? readFileSync(p, 'utf-8') : null
}

const report = mapRouteBudgetReport(
  readFileSync(indexPath, 'utf-8'),
  names,
  read
)
process.stdout.write(JSON.stringify(report, null, 2) + '\n')

if (report.violations.length > 0) {
  for (const v of report.violations)
    console.error(`check-map-route-budget: ${v}`)
  process.exit(1)
}
const kb = (n: number) => `${Math.round(n / 1024)} KB`
console.error(
  `check-map-route-budget: OK — ${report.routes
    .map(r => `${r.entry} ${kb(r.mainThreadGzipBytes)}`)
    .join(', ')}; worker ${kb(report.worker?.gzipBytes ?? 0)} (gzip)`
)
