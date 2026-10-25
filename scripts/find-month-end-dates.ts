#!/usr/bin/env npx ts-node
/**
 * Find Month-End Dates from raw-csv GCS Metadata (read-only)
 *
 * Scans gs://<bucket>/raw-csv/ for all collection dates,
 * reads their metadata.json files, and identifies the last closing-period
 * collection date per calendar month for each completed program year.
 *
 * This is the FIRST step in the #140 snapshot pruning workflow.
 * It produces no writes — it only reports what dates would be kept.
 *
 * Usage:
 *   npx ts-node scripts/find-month-end-dates.ts
 *   npx ts-node scripts/find-month-end-dates.ts --json
 *   npx ts-node scripts/find-month-end-dates.ts --bucket my-bucket
 *
 * Output table columns:
 *   dataMonth     | YYYY-MM of the month the data represents
 *   lastClosingDate | The collection date to use for month-end snapshot
 *   allClosingDates | How many closing-period collections existed for this month
 *   programYear   | Toastmasters program year this month belongs to
 *
 * Bucket (#2286): --bucket <name> or GCS_BUCKET, else staging
 * (toast-stats-data-staging). Naming prod (toast-stats-data-ca) needs
 * --allow-prod.
 */

import { Storage } from '@google-cloud/storage'
import { buildMonthEndSummary } from './lib/monthEndDates.js'
import { listRawCSVDates, readMetadataForDates } from './lib/gcsHelpers.js'
import { resolveOperatorBucket } from './lib/operatorBucket.js'

// ── Config ────────────────────────────────────────────────────────────────────

const RAW_CSV_PREFIX = 'raw-csv'

interface Args {
  bucket: string
  projectId: string | undefined
  jsonOutput: boolean
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const { bucket } = resolveOperatorBucket({
    argv: args,
    env: process.env,
    writes: false,
  })
  const projectId = process.env['GCP_PROJECT_ID']
  let jsonOutput = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--bucket' && args[i + 1]) {
      i++ // resolved by resolveOperatorBucket
    } else if (arg === '--json') {
      jsonOutput = true
    }
  }

  return { bucket, projectId, jsonOutput }
}

// ── Formatting ────────────────────────────────────────────────────────────────

function printTable(summaries: ReturnType<typeof buildMonthEndSummary>): void {
  const completed = summaries.filter(s => s.isComplete)
  const current = summaries.filter(s => !s.isComplete)

  console.log('='.repeat(80))
  console.log('Month-End Closing Period Date Report')
  console.log('='.repeat(80))
  console.log()

  if (current.length > 0) {
    console.log(
      `Current program year (skipped): ${current.map(s => s.year).join(', ')}`
    )
    console.log()
  }

  for (const py of completed) {
    console.log(`Program Year: ${py.year}`)
    console.log('-'.repeat(70))
    console.log(
      'dataMonth'.padEnd(12) +
        'lastClosingDate'.padEnd(18) +
        'closingDates'.padEnd(14) +
        'status'
    )
    console.log('-'.repeat(70))

    for (const r of py.monthResults) {
      console.log(
        r.dataMonth.padEnd(12) +
          r.lastClosingDate.padEnd(18) +
          String(r.allClosingDates.length).padEnd(14) +
          '✓ keeper found'
      )
    }

    for (const m of py.missingMonths) {
      console.log(
        m.padEnd(12) +
          '(none)'.padEnd(18) +
          '0'.padEnd(14) +
          '⚠ no closing-period data'
      )
    }

    const totalKeepers = py.monthResults.length
    const totalMissing = py.missingMonths.length
    console.log()
    console.log(
      `  Summary: ${totalKeepers} months with closing data, ${totalMissing} months missing`
    )
    console.log()
  }

  // Print flat list of all keeper dates (for use in next scripts)
  const allKeeperDates = completed
    .flatMap(py => py.monthResults.map(r => r.lastClosingDate))
    .sort()

  console.log('='.repeat(80))
  console.log(`Total month-end keeper dates: ${allKeeperDates.length}`)
  console.log()
  console.log('Keeper collection dates (for generate-month-end-snapshots.ts):')
  for (const date of allKeeperDates) {
    console.log(`  ${date}`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { bucket, projectId, jsonOutput } = parseArgs()
  const today = new Date()

  if (!jsonOutput) {
    console.log(
      `Scanning gs://${bucket}/${RAW_CSV_PREFIX}/ for closing-period dates...`
    )
    console.log()
  }

  const storage = new Storage({ projectId })

  // Step 1: List all raw-csv dates
  const dates = await listRawCSVDates(storage, bucket)

  if (!jsonOutput) {
    console.log(`Found ${dates.length} collection dates. Reading metadata...`)
  }

  // Step 2: Read metadata for each date (in parallel batches of 20)
  const entries = await readMetadataForDates(storage, bucket, dates)

  const closingPeriodCount = entries.filter(e => e.isClosingPeriod).length
  if (!jsonOutput) {
    console.log(`  Done. ${closingPeriodCount} closing-period entries found.`)
    console.log()
  }

  // Step 3: Build month-end summary
  const summaries = buildMonthEndSummary(entries, today)

  if (jsonOutput) {
    console.log(JSON.stringify(summaries, null, 2))
  } else {
    printTable(summaries)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
