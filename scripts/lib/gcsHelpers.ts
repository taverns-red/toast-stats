/**
 * Shared GCS I/O helpers for snapshot pruning scripts.
 *
 * These helpers are pure I/O adapters — no business logic.
 * They are extracted here to:
 *   1. Eliminate duplication across find-month-end-dates.ts,
 *      generate-month-end-snapshots.ts, and prune-daily-snapshots.ts
 *   2. Provide a single seam for mocking in unit tests
 */

import { Storage } from '@google-cloud/storage'
import type { RawCSVEntry } from './monthEndDates.js'

const METADATA_FILENAME = 'metadata.json'

interface RawMetadata {
  date?: string
  isClosingPeriod?: boolean
  dataMonth?: string
}

/**
 * List all YYYY-MM-DD date directories under a given GCS prefix.
 *
 * Uses manual pagination because autoPaginate + delimiter does not reliably
 * collect all virtual-directory prefixes across page boundaries in the GCS
 * Node.js SDK — subsequent pages omit the `prefixes` field entirely.
 */
async function listDateDirectories(
  storage: Storage,
  bucketName: string,
  gcsPrefix: string
): Promise<string[]> {
  const bucket = storage.bucket(bucketName)
  const allPrefixes: string[] = []
  let pageToken: string | undefined

  do {
    const [, , apiResponse] = await bucket.getFiles({
      prefix: gcsPrefix,
      delimiter: '/',
      maxResults: 1000,
      pageToken,
      autoPaginate: false,
    })

    const response = apiResponse as Record<string, unknown>
    const pagePrefixes = (response?.['prefixes'] as string[] | undefined) ?? []
    allPrefixes.push(...pagePrefixes)
    pageToken = response?.['nextPageToken'] as string | undefined
  } while (pageToken)

  const dates: string[] = []
  for (const p of allPrefixes) {
    const date = p.replace(gcsPrefix, '').replace(/\/$/, '')
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.push(date)
  }
  return dates.sort()
}

/**
 * List all YYYY-MM-DD date directories under raw-csv/ in GCS.
 * Returns dates sorted ascending.
 */
export async function listRawCSVDates(
  storage: Storage,
  bucketName: string
): Promise<string[]> {
  return listDateDirectories(storage, bucketName, 'raw-csv/')
}

/**
 * List all YYYY-MM-DD date directories under snapshots/ in GCS.
 * Returns dates sorted ascending.
 */
export async function listSnapshotDates(
  storage: Storage,
  bucketName: string
): Promise<string[]> {
  return listDateDirectories(storage, bucketName, 'snapshots/')
}

/**
 * Read raw-csv/{date}/metadata.json from GCS.
 * On any error (missing file, malformed JSON), returns a non-closing-period entry.
 */
export async function readMetadataForDate(
  storage: Storage,
  bucketName: string,
  date: string
): Promise<RawCSVEntry> {
  try {
    const objectPath = `raw-csv/${date}/${METADATA_FILENAME}`
    const file = storage.bucket(bucketName).file(objectPath)
    const [buffer] = await file.download()
    const meta = JSON.parse(buffer.toString('utf-8')) as RawMetadata

    return {
      collectionDate: date,
      isClosingPeriod: meta.isClosingPeriod === true,
      dataMonth: meta.dataMonth,
    }
  } catch {
    // Missing or malformed metadata — treat as non-closing-period entry
    return {
      collectionDate: date,
      isClosingPeriod: false,
      dataMonth: undefined,
    }
  }
}

/** Default bucket + trailing-window size shared by the closing-date registry
 * check (daily pipeline) and the registry update script — the guard and its
 * remediation tool must read the SAME feed or a filed alert can never
 * self-clear (#1128). The window counts raw-csv date DIRECTORIES, not
 * calendar days. */
export const RAW_CSV_DEFAULT_BUCKET = 'toast-stats-data-staging'
export const RAW_CSV_DEFAULT_WINDOW = 130

/**
 * Read RawCSVEntry metadata for the most recent `windowDays` raw-csv date
 * directories in a bucket (newest-last listing, trailing slice).
 */
export async function readRecentRawCSVEntries(
  storage: Storage,
  bucketName: string,
  windowDays: number,
  log?: (msg: string) => void
): Promise<RawCSVEntry[]> {
  const allDates = await listRawCSVDates(storage, bucketName)
  const windowDates = allDates.slice(-windowDays)
  log?.(
    `raw-csv: ${allDates.length} dates in gs://${bucketName}, reading metadata for the last ${windowDates.length}`
  )
  return readMetadataForDates(storage, bucketName, windowDates)
}

/**
 * Read metadata for a batch of dates in parallel (batch size 20).
 * Returns entries in the same order as the input dates array.
 */
export async function readMetadataForDates(
  storage: Storage,
  bucketName: string,
  dates: string[],
  batchSize = 20
): Promise<RawCSVEntry[]> {
  const entries: RawCSVEntry[] = []

  for (let i = 0; i < dates.length; i += batchSize) {
    const batch = dates.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(date => readMetadataForDate(storage, bucketName, date))
    )
    entries.push(...results)
  }

  return entries
}
