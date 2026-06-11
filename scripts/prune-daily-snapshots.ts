#!/usr/bin/env npx ts-node
/**
 * Prune Daily GCS Snapshot Folders (Step 3 of #140 — DESTRUCTIVE)
 *
 * Deletes all GCS snapshot folders (snapshots/{date}/) that are NOT
 * month-end keepers for completed program years.
 *
 * Safety guarantees:
 *   - Current program year snapshots are NEVER deleted (hard exit if violated)
 *   - Defaults to --dry-run; requires explicit --execute to delete
 *   - Processes deletes in parallel batches of 10 folders
 *   - Logs every folder before deleting
 *
 * Prerequisites:
 *   - Run find-month-end-dates.ts first to verify keeper dates look correct
 *   - Run generate-month-end-snapshots.ts --execute to ensure month-end
 *     snapshots exist in GCS before pruning
 *
 * Usage:
 *   npx ts-node scripts/prune-daily-snapshots.ts
 *   npx ts-node scripts/prune-daily-snapshots.ts --execute
 *   npx ts-node scripts/prune-daily-snapshots.ts --program-year 2024-2025
 */

import { Storage } from '@google-cloud/storage'
import { buildMonthEndSummary } from './lib/monthEndDates.js'
import {
  listRawCSVDates,
  listSnapshotDates,
  readMetadataForDates,
} from './lib/gcsHelpers.js'
import { classifySnapshotDates } from './lib/pruneClassifier.js'
import {
  assertPruneDeletionScope,
  formatPruneLayerScopeNote,
} from './lib/pruneGcsDeletions.js'

// ── Config ────────────────────────────────────────────────────────────────────

const RAW_CSV_PREFIX = 'raw-csv'
const SNAPSHOT_PREFIX = 'snapshots'

interface Args {
  bucket: string
  projectId: string | undefined
  dryRun: boolean
  programYear: string | undefined
  /** Which GCS prefix to prune: 'snapshots' (default) | 'raw-csv' | 'both' */
  target: 'snapshots' | 'raw-csv' | 'both'
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  let bucket = process.env['GCS_BUCKET'] ?? 'toast-stats-data-ca'
  const projectId = process.env['GCP_PROJECT_ID']
  let dryRun = true
  let programYear: string | undefined

  let target: 'snapshots' | 'raw-csv' | 'both' = 'snapshots'

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--execute') dryRun = false
    else if (arg === '--dry-run') dryRun = true
    else if (arg === '--bucket' && args[i + 1]) bucket = args[++i]!
    else if (arg === '--program-year' && args[i + 1]) programYear = args[++i]!
    else if (arg === '--target' && args[i + 1]) {
      const t = args[++i]!
      if (t === 'raw-csv' || t === 'snapshots' || t === 'both') target = t
      else {
        console.error(`Unknown --target value: ${t}`)
        process.exit(1)
      }
    }
  }

  return { bucket, projectId, dryRun, programYear, target }
}

/**
 * Delete all objects under {prefix}/{date}/ in GCS.
 * Returns the number of objects deleted.
 */
async function deleteFolderByPrefix(
  storage: Storage,
  bucketName: string,
  prefix: string,
  date: string
): Promise<number> {
  const bucket = storage.bucket(bucketName)
  const gcsPrefix = `${prefix}/${date}/`
  const [files] = await bucket.getFiles({ prefix: gcsPrefix })

  if (files.length === 0) return 0

  await Promise.all(files.map(f => f.delete()))
  return files.length
}

// Backward-compat alias used if any code still calls deleteSnapshotFolder
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function deleteSnapshotFolder(
  storage: Storage,
  bucketName: string,
  date: string
): Promise<number> {
  return deleteFolderByPrefix(storage, bucketName, 'snapshots', date)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { bucket, projectId, dryRun, programYear, target } = parseArgs()
  const today = new Date()

  console.log('='.repeat(80))
  console.log(
    dryRun
      ? 'Prune Daily Snapshots [DRY RUN — no changes will be made]'
      : '⚠️  Prune Daily Snapshots [EXECUTE MODE — DELETING GCS OBJECTS]'
  )
  console.log('='.repeat(80))
  console.log(`Bucket: gs://${bucket}/`)
  console.log(`Target: ${target}`)
  console.log(formatPruneLayerScopeNote())
  if (programYear) console.log(`Filter: program year ${programYear} only`)
  console.log()

  const storage = new Storage({ projectId })

  // Step 1: Discover month-end keeper dates from raw-csv metadata
  console.log('Step 1: Scanning raw-csv/ to identify month-end keeper dates...')
  const rawDates = await listRawCSVDates(storage, bucket)
  const entries = await readMetadataForDates(storage, bucket, rawDates)

  const summaries = buildMonthEndSummary(entries, today)

  // Build the complete set of keeper collection dates
  const keeperDates = new Set<string>()
  for (const s of summaries) {
    if (!s.isComplete) continue
    if (programYear && s.year !== programYear) continue
    for (const r of s.monthResults) {
      keeperDates.add(r.lastClosingDate)
    }
  }

  console.log(`  Found ${keeperDates.size} month-end keeper dates.`)
  console.log()

  // Step 2: List all dates in targeted GCS prefix(es)
  const targetsToProcess: Array<{
    prefix: string
    label: string
    dates: string[]
  }> = []

  if (target === 'snapshots' || target === 'both') {
    console.log('Step 2: Listing all GCS snapshot folders...')
    const snapshotDates = await listSnapshotDates(storage, bucket)
    console.log(`  Found ${snapshotDates.length} snapshot folders.`)
    targetsToProcess.push({
      prefix: SNAPSHOT_PREFIX,
      label: 'snapshots/',
      dates: snapshotDates,
    })
  }

  if (target === 'raw-csv' || target === 'both') {
    console.log('Step 2: Listing all GCS raw-csv folders...')
    // raw-csv may overlap with rawDates already fetched — reuse if available
    const rawCsvDates = rawDates
    console.log(`  Found ${rawCsvDates.length} raw-csv folders.`)
    targetsToProcess.push({
      prefix: RAW_CSV_PREFIX,
      label: 'raw-csv/',
      dates: rawCsvDates,
    })
  }
  console.log()

  for (const { prefix, label, dates } of targetsToProcess) {
    // Step 3: Classify using pure classifier
    const { toKeep, toDelete, guardViolations } = classifySnapshotDates(
      dates,
      keeperDates,
      today,
      programYear
    )

    // Structural scope guard (#1132): this manual entry point deletes too,
    // so it must prove every path sits under a deletable layer before any
    // delete (and loudly in dry-run as well) — same gate as the workflow's
    // prune-gcs-deletions path.
    assertPruneDeletionScope(toDelete.map(date => `${prefix}/${date}`))

    // Hard fail on safety violations
    if (guardViolations.length > 0) {
      console.error('FATAL: Current program year guard violation!')
      console.error('The following dates would have been incorrectly deleted:')
      for (const d of guardViolations) console.error(`  ${d}`)
      process.exit(1)
    }

    // Report
    console.log(`Step 3 [${label}]: Classification results`)
    console.log('-'.repeat(60))
    console.log(`  To KEEP:   ${toKeep.length} folders`)
    console.log(`  To DELETE: ${toDelete.length} folders`)
    console.log()

    console.log(`Folders that will be DELETED (${label}):`)
    for (const date of toDelete) {
      console.log(`  DELETE  gs://${bucket}/${prefix}/${date}/`)
    }

    console.log()
    console.log(`Keeper dates (will NOT be deleted):`)
    for (const date of [...keeperDates].sort()) {
      console.log(`  KEEP    gs://${bucket}/${prefix}/${date}/`)
    }
    console.log()

    if (dryRun) {
      console.log(`DRY RUN for ${label} complete.`)
      continue
    }

    // Execute: delete in parallel batches
    console.log(`=`.repeat(80))
    console.log(
      `EXECUTING DELETIONS for ${label} (${toDelete.length} folders)...`
    )
    console.log()

    const DELETE_BATCH_SIZE = 10
    let totalObjectsDeleted = 0
    let foldersDeleted = 0
    let foldersFailed = 0

    for (let i = 0; i < toDelete.length; i += DELETE_BATCH_SIZE) {
      const batch = toDelete.slice(i, i + DELETE_BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async date => {
          const count = await deleteFolderByPrefix(
            storage,
            bucket,
            prefix,
            date
          )
          console.log(`  ✓ Deleted ${label}${date}/ (${count} objects)`)
          return count
        })
      )

      for (const result of results) {
        if (result.status === 'fulfilled') {
          totalObjectsDeleted += result.value
          foldersDeleted++
        } else {
          console.error(
            `  ✗ Delete failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
          )
          foldersFailed++
        }
      }
    }

    console.log()
    console.log('='.repeat(80))
    console.log(`Pruning complete for ${label}:`)
    console.log(`  Folders deleted: ${foldersDeleted}`)
    console.log(`  Objects deleted: ${totalObjectsDeleted}`)
    console.log(`  Failures:        ${foldersFailed}`)

    if (foldersFailed > 0) process.exit(1)
  }

  if (dryRun) {
    console.log('DRY RUN complete. Re-run with --execute to perform deletions.')
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
