#!/usr/bin/env npx ts-node
/**
 * Generate Month-End Snapshots (Step 2 of #140 snapshot pruning)
 *
 * For each month-end closing-period collection date identified by
 * find-month-end-dates.ts, this script:
 *   1. Syncs raw-csv/{date}/ from GCS to local cache
 *   2. Runs collector-cli transform --date {date}
 *   3. Runs collector-cli compute-analytics --date {date}
 *   4. Runs collector-cli upload --date {date}
 *
 * Defaults to --dry-run. Requires --execute to actually run the pipeline.
 *
 * Usage:
 *   npx ts-node scripts/generate-month-end-snapshots.ts
 *   npx ts-node scripts/generate-month-end-snapshots.ts --execute
 *   npx ts-node scripts/generate-month-end-snapshots.ts --program-year 2024-2025
 *   npx ts-node scripts/generate-month-end-snapshots.ts --dry-run --json
 *
 * Bucket (#2286): pass --bucket <name> or set GCS_BUCKET; there is no
 * default. Naming the prod bucket (toast-stats-data-ca) also needs
 * --allow-prod.
 */

import { execSync } from 'child_process'
import { Storage } from '@google-cloud/storage'
import * as fs from 'fs'
import * as path from 'path'
import {
  buildMonthEndSummary,
  type MonthEndResult,
} from './lib/monthEndDates.js'
import { listRawCSVDates, readMetadataForDates } from './lib/gcsHelpers.js'
import { selectDatesToProcess } from './lib/generateMonthEndSnapshots.js'
import { resolveOperatorBucket } from './lib/operatorBucket.js'

// ── Config ────────────────────────────────────────────────────────────────────

const RAW_CSV_PREFIX = 'raw-csv'

interface Args {
  bucket: string
  allowProd: boolean
  projectId: string | undefined
  cacheDir: string
  dryRun: boolean
  programYear: string | undefined
  jsonOutput: boolean
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const { bucket, allowProd } = resolveOperatorBucket({
    argv: args,
    env: process.env,
    writes: true,
  })
  const projectId = process.env['GCP_PROJECT_ID']
  let cacheDir = process.env['CACHE_DIR'] ?? './cache'
  let dryRun = true
  let programYear: string | undefined
  let jsonOutput = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--execute') dryRun = false
    else if (arg === '--dry-run') dryRun = true
    else if (arg === '--json') jsonOutput = true
    else if (arg === '--bucket' && args[i + 1]) i++
    else if (arg === '--cache-dir' && args[i + 1]) cacheDir = args[++i]!
    else if (arg === '--program-year' && args[i + 1]) programYear = args[++i]!
  }

  return {
    bucket,
    allowProd,
    projectId,
    cacheDir,
    dryRun,
    programYear,
    jsonOutput,
  }
}

/**
 * Sync all files under raw-csv/{date}/ from GCS to local cache directory.
 */
async function syncRawCSVToCache(
  storage: Storage,
  bucketName: string,
  date: string,
  cacheDir: string
): Promise<number> {
  const bucket = storage.bucket(bucketName)
  const prefix = `${RAW_CSV_PREFIX}/${date}/`
  const [files] = await bucket.getFiles({ prefix })

  let count = 0
  for (const file of files) {
    const relativePath = file.name.replace(prefix, '')
    const localPath = path.join(cacheDir, RAW_CSV_PREFIX, date, relativePath)
    fs.mkdirSync(path.dirname(localPath), { recursive: true })
    await file.download({ destination: localPath })
    count++
  }
  return count
}

// ── Pipeline Runner ───────────────────────────────────────────────────────────

function runCLI(
  command: string,
  cacheDir: string,
  bucket: string
): { ok: boolean; output: string } {
  try {
    const output = execSync(
      `node packages/collector-cli/dist/index.js ${command} --config . 2>&1 || \
       npx ts-node packages/collector-cli/src/index.ts ${command}`,
      {
        cwd: process.cwd(),
        env: { ...process.env, CACHE_DIR: cacheDir, GCS_BUCKET: bucket },
        timeout: 300_000, // 5 min per date
      }
    ).toString()
    return { ok: true, output }
  } catch (err: unknown) {
    const output = err instanceof Error ? err.message : String(err)
    return { ok: false, output }
  }
}

interface ProcessResult {
  date: string
  dataMonth: string
  steps: { transform: boolean; analytics: boolean; upload: boolean }
  error?: string
  durationMs: number
}

async function processDate(
  storage: Storage,
  bucket: string,
  allowProd: boolean,
  date: string,
  cacheDir: string
): Promise<ProcessResult> {
  const start = Date.now()
  const result: ProcessResult = {
    date,
    dataMonth: '',
    steps: { transform: false, analytics: false, upload: false },
    durationMs: 0,
  }

  try {
    // Step 1: Sync raw-csv from GCS to local cache
    console.log(`  [1/4] Syncing raw-csv/${date}/ from GCS...`)
    await syncRawCSVToCache(storage, bucket, date, cacheDir)

    // Step 2: Transform
    console.log(`  [2/4] Running transform --date ${date}...`)
    const transformResult = runCLI(`transform --date ${date}`, cacheDir, bucket)
    result.steps.transform = transformResult.ok
    if (!transformResult.ok) {
      result.error = `Transform failed: ${transformResult.output.slice(0, 200)}`
      return result
    }

    // Step 3: Analytics
    console.log(`  [3/4] Running compute-analytics --date ${date}...`)
    const analyticsResult = runCLI(
      `compute-analytics --date ${date}`,
      cacheDir,
      bucket
    )
    result.steps.analytics = analyticsResult.ok
    if (!analyticsResult.ok) {
      result.error = `Analytics failed: ${analyticsResult.output.slice(0, 200)}`
      return result
    }

    // Step 4: Upload
    console.log(`  [4/4] Running upload --date ${date}...`)
    // collector-cli upload refuses prod without --allow-prod (#2288); the
    // operator already confirmed it to this script, so pass it on.
    const uploadResult = runCLI(
      `upload --date ${date}${allowProd ? ' --allow-prod' : ''}`,
      cacheDir,
      bucket
    )
    result.steps.upload = uploadResult.ok
    if (!uploadResult.ok) {
      result.error = `Upload failed: ${uploadResult.output.slice(0, 200)}`
    }
  } catch (err: unknown) {
    result.error = err instanceof Error ? err.message : String(err)
  } finally {
    result.durationMs = Date.now() - start
  }

  return result
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const {
    bucket,
    allowProd,
    projectId,
    cacheDir,
    dryRun,
    programYear,
    jsonOutput,
  } = parseArgs()
  const today = new Date()

  if (!jsonOutput) {
    console.log('='.repeat(80))
    console.log(
      dryRun
        ? 'Generate Month-End Snapshots [DRY RUN — no changes will be made]'
        : 'Generate Month-End Snapshots [EXECUTE MODE]'
    )
    console.log('='.repeat(80))
    console.log(`Bucket: gs://${bucket}/`)
    console.log(`Cache:  ${path.resolve(cacheDir)}`)
    if (programYear) console.log(`Filter: program year ${programYear} only`)
    console.log()
  }

  const storage = new Storage({ projectId })

  // Discover month-end dates
  if (!jsonOutput) console.log('Scanning raw-csv/ metadata...')
  const dates = await listRawCSVDates(storage, bucket)
  const entries = await readMetadataForDates(storage, bucket, dates)

  const summaries = buildMonthEndSummary(entries, today)

  // Collect month-end results to process (pure function, no side effects)
  const monthEndDates: MonthEndResult[] = selectDatesToProcess(
    summaries,
    today,
    programYear
  )

  if (!jsonOutput) {
    console.log(`Found ${monthEndDates.length} month-end dates to process:`)
    for (const r of monthEndDates) {
      console.log(
        `  ${r.dataMonth} → collectionDate: ${r.lastClosingDate} (${r.allClosingDates.length} closing dates)`
      )
    }
    console.log()
  }

  if (dryRun) {
    console.log(
      'DRY RUN complete. Re-run with --execute to process these dates.'
    )
    if (jsonOutput) {
      console.log(
        JSON.stringify({ dryRun: true, dates: monthEndDates }, null, 2)
      )
    }
    return
  }

  // Execute mode: process each date
  const results: ProcessResult[] = []
  let successCount = 0
  let failCount = 0

  for (const r of monthEndDates) {
    const { lastClosingDate, dataMonth } = r
    console.log()
    console.log(
      `Processing ${dataMonth} (collectionDate: ${lastClosingDate})...`
    )

    const result = await processDate(
      storage,
      bucket,
      allowProd,
      lastClosingDate,
      cacheDir
    )
    result.dataMonth = dataMonth
    results.push(result)

    if (result.error) {
      console.log(`  ✗ Failed: ${result.error}`)
      failCount++
    } else {
      console.log(`  ✓ Done in ${(result.durationMs / 1000).toFixed(1)}s`)
      successCount++
    }
  }

  // Summary
  console.log()
  console.log('='.repeat(80))
  console.log(`Complete: ${successCount} succeeded, ${failCount} failed`)

  if (jsonOutput) {
    console.log(JSON.stringify({ results, successCount, failCount }, null, 2))
  }

  process.exit(failCount > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
