#!/usr/bin/env npx ts-node
/**
 * Backfill Raw CSV for Specific Dates (Step 2 of #152 pipeline)
 *
 * For each identified month-end keeper date, downloads the complete set of
 * district CSVs directly from the Toastmasters dashboard into GCS
 * (`raw-csv/{date}/`), ensuring completeness before snapshot generation.
 *
 * This uses HttpCsvDownloader directly (not BackfillOrchestrator) since we
 * work with specific dates rather than year ranges.
 *
 * Usage:
 *   npx ts-node scripts/backfill-raw-csv-for-dates.ts --dates 2024-09-03,2025-01-06
 *   npx ts-node scripts/backfill-raw-csv-for-dates.ts --dates-file /tmp/keeper-dates.txt
 *   npx ts-node scripts/backfill-raw-csv-for-dates.ts --dates 2024-09-03 --execute
 *   npx ts-node scripts/backfill-raw-csv-for-dates.ts --dates 2024-09-03 --dry-run
 */

import { Storage } from '@google-cloud/storage'
import * as fs from 'fs'
import * as readline from 'readline'
import {
  HttpCsvDownloader,
  type ReportType as HttpReportType,
} from '../packages/collector-cli/src/services/HttpCsvDownloader.js'
import {
  GcsBackfillStorage,
  buildBackfillMetadata,
} from '../packages/collector-cli/src/services/BackfillOrchestrator.js'
import {
  buildCsvPathFromReport,
  buildMetadataPath,
  calculateProgramYear,
} from '../packages/collector-cli/src/utils/CachePaths.js'

// ── Config ────────────────────────────────────────────────────────────────────

/** Minimum CSV files expected per date (districtsummary + 3 per district × N districts) */
const MIN_CSV_FILES_PER_DATE = 10

/** How many days into the next month to scan for the forward discovery window */
export const FORWARD_SCAN_WINDOW_DAYS = 14

/** Per-district report types to download */
const DISTRICT_REPORT_TYPES: HttpReportType[] = [
  'districtperformance',
  'divisionperformance',
  'clubperformance',
]

interface Args {
  bucket: string
  projectId: string | undefined
  dates: string[]
  dryRun: boolean
  ratePerSecond: number
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  let bucket = process.env['GCS_BUCKET'] ?? 'toast-stats-data-ca'
  const projectId = process.env['GCP_PROJECT_ID']
  const dates: string[] = []
  let dryRun = true
  let ratePerSecond = 2

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--execute') dryRun = false
    else if (arg === '--dry-run') dryRun = true
    else if (arg === '--bucket' && argv[i + 1]) bucket = argv[++i]!
    else if (arg === '--rate' && argv[i + 1])
      ratePerSecond = parseFloat(argv[++i]!)
    else if (arg === '--dates' && argv[i + 1]) {
      dates.push(
        ...argv[++i]!.split(',')
          .map(d => d.trim())
          .filter(Boolean)
      )
    } else if (arg === '--dates-file' && argv[i + 1]) {
      const filePath = argv[++i]!
      const lines = fs
        .readFileSync(filePath, 'utf-8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => /^\d{4}-\d{2}-\d{2}$/.test(l))
      dates.push(...lines)
    }
  }

  if (dates.length === 0) {
    console.error(
      'ERROR: No dates provided. Use --dates YYYY-MM-DD,... or --dates-file path'
    )
    process.exit(1)
  }

  return { bucket, projectId, dates, dryRun, ratePerSecond }
}

// ── GCS Helpers ───────────────────────────────────────────────────────────────

/** Count existing CSV objects under raw-csv/{date}/ in GCS */
async function countExistingCsvFiles(
  storage: Storage,
  bucketName: string,
  date: string
): Promise<number> {
  const [files] = await storage.bucket(bucketName).getFiles({
    prefix: `raw-csv/${date}/`,
  })
  return files.filter(f => f.name.endsWith('.csv')).length
}

// ── Phase 1: Discover districts ───────────────────────────────────────────────

async function discoverDistrictsForDate(
  downloader: HttpCsvDownloader,
  gcs: GcsBackfillStorage,
  bucketName: string,
  date: string,
  dryRun: boolean
): Promise<string[]> {
  const programYear = calculateProgramYear(date)
  const dateObj = new Date(date + 'T00:00:00Z')
  const summaryPath = buildCsvPathFromReport('', dateObj, 'districtsummary')

  if (dryRun) {
    console.log(
      `  [dry-run] Would download districtsummary for ${date} → gs://${bucketName}/${summaryPath}`
    )
    return ['20', '42', '57', '61', '86', '109', '117'] // placeholder list for dry-run
  }

  // Check if already in GCS
  const exists = await gcs.exists(summaryPath)
  if (exists) {
    console.log(`  ✓ districtsummary already in GCS — parsing cached version`)
    const content = await gcs.read(summaryPath)
    return downloader.parseDistrictsFromSummary(content)
  }

  console.log(`  Downloading districtsummary for ${date}...`)
  const result = await downloader.downloadCsv({
    programYear,
    reportType: 'districtsummary',
    date: dateObj,
  })
  await gcs.write(summaryPath, result.content)
  const districts = downloader.parseDistrictsFromSummary(result.content)
  console.log(
    `  Found ${districts.length} districts: ${districts.slice(0, 8).join(', ')}${districts.length > 8 ? '...' : ''}`
  )
  return districts
}

// ── Phase 2: Download per-district CSVs ───────────────────────────────────────

async function downloadDistrictCsvsForDate(
  downloader: HttpCsvDownloader,
  gcs: GcsBackfillStorage,
  bucketName: string,
  date: string,
  districtIds: string[],
  dryRun: boolean
): Promise<{ downloaded: number; skipped: number; errors: number }> {
  const programYear = calculateProgramYear(date)
  const dateObj = new Date(date + 'T00:00:00Z')
  let downloaded = 0
  let skipped = 0
  let errors = 0

  for (const districtId of districtIds) {
    for (const reportType of DISTRICT_REPORT_TYPES) {
      const gcsPath = buildCsvPathFromReport(
        '',
        dateObj,
        reportType,
        districtId
      )

      if (dryRun) {
        console.log(
          `  [dry-run] Would download ${reportType} district=${districtId} → gs://${bucketName}/${gcsPath}`
        )
        downloaded++
        continue
      }

      // Resume: skip if already in GCS
      const exists = await gcs.exists(gcsPath)
      if (exists) {
        skipped++
        continue
      }

      try {
        const result = await downloader.downloadCsv({
          programYear,
          reportType,
          districtId,
          date: dateObj,
        })
        await gcs.write(gcsPath, result.content)
        downloaded++
      } catch (err) {
        console.error(
          `  ✗ Failed: ${reportType} district=${districtId} — ${err instanceof Error ? err.message : String(err)}`
        )
        errors++
      }
    }
  }

  return { downloaded, skipped, errors }
}

// ── Phase 3: Write / update metadata.json ────────────────────────────────────

async function patchMetadata(
  gcs: GcsBackfillStorage,
  date: string,
  districtIds: string[],
  dryRun: boolean
): Promise<void> {
  const dateObj = new Date(date + 'T00:00:00Z')
  const metaPath = buildMetadataPath('', dateObj)

  if (dryRun) {
    console.log(
      `  [dry-run] Would write/patch metadata.json for ${date} at gs://<bucket>/${metaPath}`
    )
    return
  }

  // Read existing metadata if present, preserve isClosingPeriod + dataMonth
  let existing: Record<string, unknown> = {}
  try {
    const raw = await gcs.read(metaPath)
    existing = JSON.parse(raw) as Record<string, unknown>
  } catch {
    // No existing metadata — build from scratch
  }

  const newMeta = buildBackfillMetadata(dateObj, districtIds)

  // Merge: preserve closing-period flags from original metadata
  const merged = {
    ...newMeta,
    isClosingPeriod: existing['isClosingPeriod'] ?? newMeta['isClosingPeriod'],
    dataMonth: existing['dataMonth'] ?? newMeta['dataMonth'],
    source: 'backfill-patched',
  }

  await gcs.write(metaPath, JSON.stringify(merged, null, 2))
  console.log(`  ✓ metadata.json written for ${date}`)
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { bucket, projectId, dates, dryRun, ratePerSecond } = parseArgs()

  console.log('='.repeat(72))
  console.log(
    dryRun
      ? 'Raw CSV Backfill for Specific Dates [DRY RUN — no changes]'
      : '⚠️  Raw CSV Backfill for Specific Dates [EXECUTE — writing to GCS]'
  )
  console.log('='.repeat(72))
  console.log(`Bucket:     gs://${bucket}/`)
  console.log(`Dates:      ${dates.join(', ')}`)
  console.log(`Rate:       ${ratePerSecond} req/s`)
  console.log()

  const storage = new Storage({ projectId })

  // Pre-flight: check which dates need backfill
  console.log('Pre-flight: checking existing CSV counts in GCS...')
  const needsBackfill: string[] = []
  const alreadyComplete: string[] = []

  for (const date of dates) {
    const count = await countExistingCsvFiles(storage, bucket, date)
    if (count >= MIN_CSV_FILES_PER_DATE) {
      alreadyComplete.push(date)
      console.log(`  ${date}: ${count} CSVs already in GCS ✓`)
    } else {
      needsBackfill.push(date)
      console.log(
        `  ${date}: ${count} CSVs (< ${MIN_CSV_FILES_PER_DATE}) — needs backfill`
      )
    }
  }

  console.log()
  console.log(
    `Summary: ${alreadyComplete.length} complete, ${needsBackfill.length} need backfill`
  )

  if (needsBackfill.length === 0) {
    console.log('Nothing to do — all dates are complete.')
    return
  }

  if (dryRun) {
    console.log()
    console.log('[DRY RUN] Would backfill the following dates:')
    for (const date of needsBackfill) {
      console.log(`  ${date}`)
    }
    console.log()
    console.log('Run with --execute to perform the backfill.')
    return
  }

  // Set up GCS-backed downloader
  const gcs = await GcsBackfillStorage.create(bucket, projectId)
  // Warm cache for the raw-csv prefix (avoids O(N) HEAD requests)
  const cachedCount = await gcs.warmCache('raw-csv/')
  console.log(`GCS cache warmed (${cachedCount} existing objects indexed)`)
  console.log()

  const downloader = new HttpCsvDownloader({
    ratePerSecond,
    cooldownEvery: 50,
    cooldownMs: 3000,
  })

  let totalDownloaded = 0
  let totalSkipped = 0
  let totalErrors = 0

  for (const date of needsBackfill) {
    console.log(`\n── ${date} ──`)

    // Phase 1: discovery
    const districtIds = await discoverDistrictsForDate(
      downloader,
      gcs,
      bucket,
      date,
      dryRun
    )

    // Phase 2: per-district CSVs
    console.log(
      `  Downloading ${districtIds.length} districts × ${DISTRICT_REPORT_TYPES.length} reports...`
    )
    const result = await downloadDistrictCsvsForDate(
      downloader,
      gcs,
      bucket,
      date,
      districtIds,
      dryRun
    )
    totalDownloaded += result.downloaded
    totalSkipped += result.skipped
    totalErrors += result.errors
    console.log(
      `  downloaded=${result.downloaded} skipped=${result.skipped} errors=${result.errors}`
    )

    // Phase 3: patch metadata.json
    await patchMetadata(gcs, date, districtIds, dryRun)
  }

  console.log()
  console.log('='.repeat(72))
  console.log(`Backfill complete`)
  console.log(`  Total downloaded: ${totalDownloaded}`)
  console.log(`  Total skipped:    ${totalSkipped}`)
  console.log(`  Total errors:     ${totalErrors}`)

  if (totalErrors > 0) {
    console.error(
      `\n⚠ ${totalErrors} errors occurred. Check output above for details.`
    )
    process.exit(1)
  }
}

// readline is imported for future interactive use; suppress unused warning
void readline

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
