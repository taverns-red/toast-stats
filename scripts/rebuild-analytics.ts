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

console.log(`📊 Computing analytics for ${dates.length} dates`)
if (dates.length === 0) {
  console.log('Nothing to do.')
  process.exit(0)
}
console.log(`   First: ${dates[0]}`)
console.log(`   Last:  ${dates[dates.length - 1]}`)
console.log(`   Force: ${force}`)
console.log()

async function main() {
  const analyticsService = new AnalyticsComputeService({ cacheDir })

  let ok = 0
  let failed = 0
  let skipped = 0

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]!
    const n = i + 1
    process.stdout.write(`  [${n}/${dates.length}] ${date} ... `)

    try {
      const result = await analyticsService.compute({
        date,
        force,
        verbose: false,
      })

      if (result.success) {
        const s = result.districtsSkipped ?? 0
        const p = result.districtsSucceeded ?? 0
        if (p > 0) {
          console.log(`✓ (${p} districts)`)
          ok++
        } else if (s > 0) {
          console.log(`⊘ skipped (${s} unchanged)`)
          skipped++
        } else {
          console.log('✓')
          ok++
        }
      } else {
        console.log(`⚠️  failed: ${result.errors?.[0] ?? 'unknown'}`)
        failed++
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`⚠️  error: ${msg}`)
      failed++
    }
  }

  console.log()
  console.log('═══════════════════════════════════════════')
  console.log('✅ Analytics rebuild complete')
  console.log('═══════════════════════════════════════════')
  console.log(`  Dates:   ${dates.length}`)
  console.log(`  Success: ${ok}`)
  console.log(`  Skipped: ${skipped}`)
  console.log(`  Failed:  ${failed}`)
  console.log()
  console.log('Next step — sync to GCS:')
  console.log(
    `  gsutil -m rsync -r -d ${cacheDir}/snapshots gs://toast-stats-data/snapshots`
  )
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
