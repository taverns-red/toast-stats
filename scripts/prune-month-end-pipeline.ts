#!/usr/bin/env npx ts-node
/**
 * Prune Month-End Pipeline — 4-Step Orchestrator (#152)
 *
 * Runs all steps of the snapshot pruning workflow in sequence:
 *
 *   Step 1: Smart month-end discovery (forward-scan metadata only)
 *   Step 2: Raw-CSV backfill for keeper dates (Toastmasters dashboard → GCS)
 *   Step 3: Prune raw-csv/ non-keeper dates
 *   Step 4: Snapshot analytics backfill (transform + compute-analytics + upload)
 *
 * All steps default to --dry-run. Use --execute to take real action.
 * Use --step N to run a single step.
 *
 * Usage:
 *   npx ts-node scripts/prune-month-end-pipeline.ts --dry-run
 *   npx ts-node scripts/prune-month-end-pipeline.ts --step 1
 *   npx ts-node scripts/prune-month-end-pipeline.ts --step 2 --execute
 *   npx ts-node scripts/prune-month-end-pipeline.ts --execute
 *   npx ts-node scripts/prune-month-end-pipeline.ts --program-year 2024-2025 --dry-run
 */

import { execSync } from 'child_process'
import { Storage } from '@google-cloud/storage'
import { listRawCSVDates, readMetadataForDates } from './lib/gcsHelpers.js'
import {
  findMonthEndKeeperForward,
  getMonthsInProgramYear,
  isProgramYearComplete,
} from './lib/monthEndDates.js'

// ── Config ────────────────────────────────────────────────────────────────────

interface Args {
  bucket: string
  projectId: string | undefined
  cacheDir: string
  dryRun: boolean
  programYear: string | undefined
  step: number | undefined
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  let bucket = process.env['GCS_BUCKET'] ?? 'toast-stats-data'
  const projectId = process.env['GCP_PROJECT_ID']
  let cacheDir = process.env['CACHE_DIR'] ?? './cache'
  let dryRun = true
  let programYear: string | undefined
  let step: number | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--execute') dryRun = false
    else if (arg === '--dry-run') dryRun = true
    else if (arg === '--bucket' && argv[i + 1]) bucket = argv[++i]!
    else if (arg === '--cache-dir' && argv[i + 1]) cacheDir = argv[++i]!
    else if (arg === '--program-year' && argv[i + 1]) programYear = argv[++i]!
    else if (arg === '--step' && argv[i + 1]) step = parseInt(argv[++i]!, 10)
  }

  return { bucket, projectId, cacheDir, dryRun, programYear, step }
}

// ── Date Utilities ────────────────────────────────────────────────────────────

/**
 * Return the YYYY-MM prefix for the calendar month that follows the given YYYY-MM.
 * e.g. '2024-08' → '2024-09', '2024-12' → '2025-01'
 */
function nextMonthPrefix(month: string): string {
  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr!, 10)
  const m = parseInt(monthStr!, 10)
  if (m === 12) return `${year + 1}-01`
  return `${year}-${String(m + 1).padStart(2, '0')}`
}

/** Derive all program year strings to consider (completed PYs, optionally filtered) */
function getProgramYearsToProcess(
  allDates: string[],
  today: Date,
  programYear?: string
): string[] {
  const pySet = new Set<string>()
  for (const date of allDates) {
    const [yearStr, monthStr] = date.split('-')
    if (!yearStr || !monthStr) continue
    const year = parseInt(yearStr, 10)
    const month = parseInt(monthStr, 10)
    const pyStart = month >= 7 ? year : year - 1
    pySet.add(`${pyStart}-${pyStart + 1}`)
  }

  return [...pySet]
    .filter(py => isProgramYearComplete(py, today))
    .filter(py => !programYear || py === programYear)
    .sort()
}

// ── Step 1: Smart Month-End Discovery ────────────────────────────────────────

async function runStep1(
  storage: Storage,
  bucket: string,
  today: Date,
  programYear: string | undefined,
  dryRun: boolean
): Promise<{ keeperDates: string[]; missingMonths: string[] }> {
  console.log()
  console.log('Step 1: Smart month-end discovery (forward-scan)')
  console.log('-'.repeat(56))

  // List all raw-csv dates once (O(1) GCS LIST call)
  console.log('  Listing raw-csv/ dates from GCS...')
  const allDates = await listRawCSVDates(storage, bucket)
  console.log(`  Found ${allDates.length} raw-csv dates total.`)

  const pys = getProgramYearsToProcess(allDates, today, programYear)
  if (pys.length === 0) {
    console.log('  No completed program years to process.')
    return { keeperDates: [], missingMonths: [] }
  }
  console.log(`  Completed program years: ${pys.join(', ')}`)

  const keeperDates: string[] = []
  const missingMonths: string[] = []

  for (const py of pys) {
    const months = getMonthsInProgramYear(py)
    console.log(`\n  Program Year ${py}:`)

    for (const month of months) {
      const prefix = nextMonthPrefix(month)

      // All raw-csv dates that fall anywhere in the next calendar month.
      // No fixed window — handles closing periods that extend 15, 20, or more
      // days into the next month without any arbitrary cutoff.
      const windowDates = allDates.filter(d => d.startsWith(prefix + '-'))

      if (windowDates.length === 0) {
        missingMonths.push(month)
        console.log(`    ${month}: ⚠ no data found in next month (${prefix})`)
        continue
      }

      // Read only the metadata for the window dates (not full CSV trees)
      const windowEntries = await readMetadataForDates(
        storage,
        bucket,
        windowDates
      )
      const keeper = findMonthEndKeeperForward(month, windowEntries)

      if (keeper === null) {
        missingMonths.push(month)
        console.log(`    ${month}: ⚠ no closing-period entry found in window`)
      } else {
        keeperDates.push(keeper)
        console.log(`    ${month}: keeper = ${keeper}`)
      }
    }
  }

  console.log()
  console.log(`  Keepers identified: ${keeperDates.length}`)
  if (missingMonths.length > 0) {
    console.log(`  Missing months: ${missingMonths.join(', ')}`)
  }
  if (dryRun) {
    console.log('  [dry-run] No changes made.')
  }

  return { keeperDates, missingMonths }
}

// ── Step 2: Raw-CSV Backfill ──────────────────────────────────────────────────

function runStep2(
  dates: string[],
  bucket: string,
  projectId: string | undefined,
  dryRun: boolean
): void {
  console.log()
  console.log('Step 2: Raw-CSV backfill for keeper dates')
  console.log('-'.repeat(56))

  if (dates.length === 0) {
    console.log('  No dates to backfill.')
    return
  }

  const dateList = dates.join(',')
  const flag = dryRun ? '--dry-run' : '--execute'
  const bucketFlag = `--bucket ${bucket}`
  const projectFlag = projectId ? `GCP_PROJECT_ID=${projectId}` : ''

  const cmd = [
    projectFlag,
    `npx ts-node scripts/backfill-raw-csv-for-dates.ts`,
    `--dates ${dateList}`,
    bucketFlag,
    flag,
  ]
    .filter(Boolean)
    .join(' ')

  console.log(`  Running: ${cmd}`)
  if (!dryRun) {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() })
  } else {
    console.log('  [dry-run] Would run backfill for:')
    for (const date of dates) console.log(`    ${date}`)
  }
}

// ── Step 3: Prune Raw-CSV Non-Keepers ────────────────────────────────────────

function runStep3(
  keeperDates: string[],
  bucket: string,
  projectId: string | undefined,
  programYear: string | undefined,
  dryRun: boolean
): void {
  console.log()
  console.log('Step 3: Prune raw-csv/ non-keeper dates')
  console.log('-'.repeat(56))

  const flag = dryRun ? '--dry-run' : '--execute'
  const bucketFlag = `--bucket ${bucket}`
  const pyFlag = programYear ? `--program-year ${programYear}` : ''
  const projectFlag = projectId ? `GCP_PROJECT_ID=${projectId}` : ''

  const cmd = [
    projectFlag,
    `npx ts-node scripts/prune-daily-snapshots.ts`,
    `--target raw-csv`,
    bucketFlag,
    pyFlag,
    flag,
  ]
    .filter(Boolean)
    .join(' ')

  console.log(`  Running: ${cmd}`)
  if (!dryRun) {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() })
  } else {
    console.log(
      `  [dry-run] Would prune raw-csv/ non-keepers (${keeperDates.length} keepers preserved)`
    )
  }
}

// ── Step 4: Snapshot Analytics Backfill ──────────────────────────────────────

function runStep4(
  bucket: string,
  projectId: string | undefined,
  cacheDir: string,
  programYear: string | undefined,
  dryRun: boolean
): void {
  console.log()
  console.log('Step 4: Snapshot analytics backfill')
  console.log('-'.repeat(56))

  const flag = dryRun ? '--dry-run' : '--execute'
  const bucketFlag = `--bucket ${bucket}`
  const cacheDirFlag = `--cache-dir ${cacheDir}`
  const pyFlag = programYear ? `--program-year ${programYear}` : ''
  const projectFlag = projectId ? `GCP_PROJECT_ID=${projectId}` : ''

  const cmd = [
    projectFlag,
    `npx ts-node scripts/generate-month-end-snapshots.ts`,
    bucketFlag,
    cacheDirFlag,
    pyFlag,
    flag,
  ]
    .filter(Boolean)
    .join(' ')

  console.log(`  Running: ${cmd}`)
  if (!dryRun) {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() })
  } else {
    console.log(
      '  [dry-run] Would run generate-month-end-snapshots.ts to build snapshots.'
    )
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { bucket, projectId, cacheDir, dryRun, programYear, step } = parseArgs()
  const today = new Date()

  console.log('='.repeat(72))
  console.log(
    dryRun
      ? 'Prune Month-End Pipeline [DRY RUN — no changes will be made]'
      : '⚠️  Prune Month-End Pipeline [EXECUTE MODE — modifying GCS]'
  )
  console.log('='.repeat(72))
  console.log(`Bucket:       gs://${bucket}/`)
  if (programYear) console.log(`Program Year: ${programYear}`)
  if (step) console.log(`Step only:    ${step}`)
  console.log()

  const storage = new Storage({ projectId })

  // Step 1 always runs (unless jumping to a specific later step)
  const shouldRunStep1 = !step || step === 1
  const shouldRunStep2 = !step || step === 2
  const shouldRunStep3 = !step || step === 3
  const shouldRunStep4 = !step || step === 4

  let keeperDates: string[] = []

  if (shouldRunStep1) {
    const result = await runStep1(storage, bucket, today, programYear, dryRun)
    keeperDates = result.keeperDates
  } else if (shouldRunStep2 || shouldRunStep3 || shouldRunStep4) {
    // If skipping step 1, we still need keeper dates for context — but step 2+ can re-derive
    console.log('(Skipping step 1 — use --step 1 to run discovery)')
  }

  if (shouldRunStep2) {
    runStep2(keeperDates, bucket, projectId, dryRun)
  }

  if (shouldRunStep3) {
    runStep3(keeperDates, bucket, projectId, programYear, dryRun)
  }

  if (shouldRunStep4) {
    runStep4(bucket, projectId, cacheDir, programYear, dryRun)
  }

  console.log()
  console.log('='.repeat(72))
  console.log(dryRun ? 'Dry run complete.' : '✅ Pipeline complete.')
  if (dryRun) {
    console.log('Run with --execute to apply changes.')
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
