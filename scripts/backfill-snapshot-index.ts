#!/usr/bin/env npx tsx
/**
 * One-Time Backfill Script
 *
 * Generates the initial district-snapshot-index.json from existing GCS data.
 * Lists all snapshot prefixes, then for each prefix lists district_*.json files,
 * and aggregates into the index structure.
 *
 * Usage:
 *   GCS_BUCKET_NAME=toast-stats-data-ca npx tsx scripts/backfill-snapshot-index.ts
 *
 * Options:
 *   --dry-run   Print the index without uploading
 */

import { Storage } from '@google-cloud/storage'
import { indexDistrictSnapshotObjects } from './lib/snapshotFileNames.js'

interface DistrictSnapshotIndex {
  generatedAt: string
  districts: Record<string, string[]>
}

async function main(): Promise<void> {
  const bucketName = process.env['GCS_BUCKET_NAME']
  if (!bucketName) {
    console.error('Error: GCS_BUCKET_NAME environment variable is required')
    process.exit(1)
  }

  const dryRun = process.argv.includes('--dry-run')
  const storage = new Storage()
  const bucket = storage.bucket(bucketName)

  console.error(`[INFO] Scanning bucket: ${bucketName}`)
  console.error(`[INFO] Listing snapshot prefixes under snapshots/...`)

  const [files] = await bucket.getFiles({
    prefix: 'snapshots/',
    delimiter: undefined,
  })

  // Only snapshots/{date}/district_{id}.json counts. The daily-reports
  // sidecar district_{id}_reports.json used to slip through the old
  // `district_(\w+)` capture — `\w` includes `_` — and published a phantom
  // district the frontend then fetched (#1428).
  const { districts: districtArrays, fileCount } = indexDistrictSnapshotObjects(
    files.map(file => file.name)
  )

  const index: DistrictSnapshotIndex = {
    generatedAt: new Date().toISOString(),
    districts: districtArrays,
  }

  const districtCount = Object.keys(districtArrays).length
  const totalDateEntries = Object.values(districtArrays).reduce(
    (sum, dates) => sum + dates.length,
    0
  )

  console.error(`[INFO] Found ${fileCount} district snapshot files`)
  console.error(
    `[INFO] ${districtCount} districts, ${totalDateEntries} total date entries`
  )

  if (dryRun) {
    console.error('[INFO] Dry run — printing index to stdout')
    console.log(JSON.stringify(index, null, 2))
  } else {
    const file = bucket.file('config/district-snapshot-index.json')
    await file.save(JSON.stringify(index, null, 2), {
      contentType: 'application/json',
    })
    console.error(
      `[INFO] Uploaded index to gs://${bucketName}/config/district-snapshot-index.json`
    )
  }
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
