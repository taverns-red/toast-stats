/**
 * Remote closing-snapshot overwrite guard (#1621) — pure decision logic.
 *
 * TransformService refuses to replace a closing snapshot with pre-close
 * input (#1608), but it only sees the LOCAL cache. rescrape and rebuild run
 * `--force` on an empty runner (R2), so that guard has nothing to compare
 * against and a pre-close month-end would be uploaded over the close in
 * GCS — unrecoverable, since the buckets are not versioned. The workflow
 * therefore checks the snapshot it is about to publish against the REMOTE
 * snapshot metadata. No I/O here; scripts/guard-snapshot-upload.ts is the
 * runner.
 */

import { gunzipSync } from 'node:zlib'

/** The provenance fields of a snapshot's metadata.json that the guard needs. */
export interface SnapshotProvenance {
  isClosingPeriodData: boolean
  /** When the source data was collected (a close is collected after its month). */
  collectionDate: string | null
}

export interface UploadDecision {
  allow: boolean
  reason: string
}

const GZIP_MAGIC_0 = 0x1f
const GZIP_MAGIC_1 = 0x8b

/**
 * Parse snapshot metadata.json bytes. Snapshots are uploaded with `-Z`
 * (Content-Encoding: gzip), so raw object bytes may be gzip; decompress when
 * the magic bytes say so. Throws on anything that is not a JSON object, so
 * the caller fails closed.
 */
export function parseSnapshotProvenance(bytes: Buffer): SnapshotProvenance {
  const text = (
    bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1
      ? gunzipSync(bytes)
      : bytes
  ).toString('utf-8')
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('snapshot metadata is not a JSON object')
  }
  const meta = parsed as Record<string, unknown>
  return {
    isClosingPeriodData: meta['isClosingPeriodData'] === true,
    collectionDate:
      typeof meta['collectionDate'] === 'string'
        ? meta['collectionDate']
        : null,
  }
}

/**
 * May `local` be uploaded over `remote` (null = no remote snapshot)?
 *
 * A close is strictly more authoritative for its month-end than any in-month
 * view, and a later close supersedes an earlier one. Anything that would
 * replace a remote close with less authoritative data — pre-close input, an
 * earlier close, or a close whose ordering cannot be proven — is refused.
 */
export function decideSnapshotUpload(
  local: SnapshotProvenance,
  remote: SnapshotProvenance | null
): UploadDecision {
  if (remote === null) {
    return { allow: true, reason: 'no remote snapshot' }
  }
  if (!remote.isClosingPeriodData) {
    return { allow: true, reason: 'remote snapshot is not closing-period data' }
  }
  if (!local.isClosingPeriodData) {
    return {
      allow: false,
      reason: `remote snapshot is closing-period data (collected ${remote.collectionDate ?? 'unknown'}); local input is pre-close`,
    }
  }
  if (local.collectionDate === null || remote.collectionDate === null) {
    return {
      allow: false,
      reason:
        'both snapshots are closing-period data but a collectionDate is missing, so the later close cannot be proven',
    }
  }
  if (local.collectionDate < remote.collectionDate) {
    return {
      allow: false,
      reason: `local close (collected ${local.collectionDate}) is older than the remote close (collected ${remote.collectionDate})`,
    }
  }
  return {
    allow: true,
    reason: `local close (collected ${local.collectionDate}) is at least as recent as the remote close (collected ${remote.collectionDate})`,
  }
}
