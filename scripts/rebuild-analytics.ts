/**
 * rebuild-analytics.ts — Compute analytics for all snapshot dates in a single process.
 *
 * Unlike the shell script that spawns tsx 3,000+ times (filling /tmp with IPC pipes),
 * this runs ONE Node.js process that loops over all dates internally.
 *
 * Usage:
 *   CACHE_DIR=/path/to/cache npx tsx scripts/rebuild-analytics.ts
 *   CACHE_DIR=/path/to/cache npx tsx scripts/rebuild-analytics.ts --since 2024-01-01
 *   CACHE_DIR=/path/to/cache npx tsx scripts/rebuild-analytics.ts --force
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { AnalyticsComputeService } from '../packages/collector-cli/src/services/AnalyticsComputeService.js'
import { classifyRebuildResult } from './lib/rebuildResult.js'

const args = process.argv.slice(2)
const since = args.includes('--since')
  ? args[args.indexOf('--since') + 1]
  : undefined
const force = args.includes('--force')

const cacheDir = process.env['CACHE_DIR'] ?? './cache'
const snapshotsDir = path.join(cacheDir, 'snapshots')

// Discover all dates from snapshot directories
if (!fs.existsSync(snapshotsDir)) {
  console.error(`❌ No snapshots directory found at ${snapshotsDir}`)
  process.exit(1)
}

let dates = fs
  .readdirSync(snapshotsDir)
  .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
  .sort()

if (since) {
  dates = dates.filter(d => d >= since)
}

console.error(`📊 Computing analytics for ${dates.length} dates`)
if (dates.length === 0) {
  console.error('Nothing to do.')
  process.exit(0)
}
console.error(`   First: ${dates[0]}`)
console.error(`   Last:  ${dates[dates.length - 1]}`)
console.error(`   Force: ${force}`)
console.error()

async function main() {
  const analyticsService = new AnalyticsComputeService({ cacheDir })

  let ok = 0
  let failed = 0
  let skipped = 0

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]!
    const n = i + 1
    process.stderr.write(`  [${n}/${dates.length}] ${date} ... `)

    try {
      const result = await analyticsService.compute({
        date,
        force,
        verbose: false,
      })

      const { category, label } = classifyRebuildResult(result)
      console.error(label)
      if (category === 'ok') ok++
      else if (category === 'skipped') skipped++
      else failed++
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`⚠️  error: ${msg}`)
      failed++
    }
  }

  console.error()
  console.error('═══════════════════════════════════════════')
  console.error('✅ Analytics rebuild complete')
  console.error('═══════════════════════════════════════════')
  console.error(`  Dates:   ${dates.length}`)
  console.error(`  Success: ${ok}`)
  console.error(`  Skipped: ${skipped}`)
  console.error(`  Failed:  ${failed}`)
  console.error()
  // No GCS command here on purpose (#1709): prod is written only by the gated
  // promotion in data-pipeline.yml, which is additive. The old hint mirrored
  // this local cache onto prod with --delete-unmatched-destination-objects.
  console.error(
    'Next step — publish through the Data Pipeline workflow (mode=rebuild):'
  )
  console.error(
    '  it uploads to staging, then promotes to prod only if the gates pass.'
  )
  console.error(
    `  Do not rsync ${cacheDir}/snapshots to the production bucket by hand.`
  )
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
