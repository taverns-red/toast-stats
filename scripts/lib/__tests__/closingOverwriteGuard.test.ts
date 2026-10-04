/**
 * Remote closing-snapshot overwrite guard (#1621).
 *
 * PR #1619 made TransformService refuse to overwrite a closing snapshot
 * (isClosingPeriodData: true) with pre-close input — but it reads the LOCAL
 * cache. A CI runner starts empty (R2), so a `rescrape`/`rebuild` of a
 * month-end has nothing local to compare against and uploads pre-close data
 * over the close in GCS. The bucket has no object versioning; that overwrite
 * is unrecoverable (2026-06-30 was lost this way). The upload must consult
 * the REMOTE snapshot metadata first.
 */

import { describe, it, expect } from 'vitest'
import { gzipSync } from 'node:zlib'
import {
  decideSnapshotUpload,
  parseSnapshotProvenance,
  type SnapshotProvenance,
} from '../closingOverwriteGuard'

const preClose: SnapshotProvenance = {
  isClosingPeriodData: false,
  collectionDate: null,
}
const close = (collectionDate: string | null): SnapshotProvenance => ({
  isClosingPeriodData: true,
  collectionDate,
})

describe('decideSnapshotUpload (#1621)', () => {
  it('refuses pre-close data over a remote closing snapshot (empty-cache rescrape of 2026-06-30)', () => {
    const decision = decideSnapshotUpload(preClose, close('2026-07-25'))
    expect(decision.allow).toBe(false)
    expect(decision.reason).toMatch(/closing/i)
  })

  it('allows an upload when no remote snapshot exists', () => {
    expect(decideSnapshotUpload(preClose, null).allow).toBe(true)
  })

  it('allows pre-close data over a remote pre-close snapshot', () => {
    expect(decideSnapshotUpload(preClose, preClose).allow).toBe(true)
  })

  it('allows closing data over a remote pre-close snapshot', () => {
    expect(decideSnapshotUpload(close('2026-07-25'), preClose).allow).toBe(true)
  })

  it('allows re-publishing the same close (idempotent rebuild)', () => {
    expect(
      decideSnapshotUpload(close('2026-07-25'), close('2026-07-25')).allow
    ).toBe(true)
  })

  it('allows a later close to replace an earlier one', () => {
    expect(
      decideSnapshotUpload(close('2026-07-25'), close('2026-07-20')).allow
    ).toBe(true)
  })

  it('refuses an earlier close over a later one', () => {
    expect(
      decideSnapshotUpload(close('2026-07-20'), close('2026-07-25')).allow
    ).toBe(false)
  })

  it('refuses when two closes cannot be ordered (missing collectionDate)', () => {
    expect(decideSnapshotUpload(close('2026-07-25'), close(null)).allow).toBe(
      false
    )
    expect(decideSnapshotUpload(close(null), close('2026-07-25')).allow).toBe(
      false
    )
  })
})

describe('parseSnapshotProvenance (#1621)', () => {
  const metadata = {
    snapshotId: '2026-06-30',
    isClosingPeriodData: true,
    collectionDate: '2026-07-25',
    logicalDate: '2026-06-30',
  }

  it('reads plain JSON metadata', () => {
    expect(
      parseSnapshotProvenance(Buffer.from(JSON.stringify(metadata)))
    ).toEqual({ isClosingPeriodData: true, collectionDate: '2026-07-25' })
  })

  it('reads gzip-encoded metadata (snapshots are uploaded with -Z)', () => {
    expect(
      parseSnapshotProvenance(gzipSync(Buffer.from(JSON.stringify(metadata))))
    ).toEqual({ isClosingPeriodData: true, collectionDate: '2026-07-25' })
  })

  it('treats a missing isClosingPeriodData flag as pre-close', () => {
    expect(
      parseSnapshotProvenance(Buffer.from('{"snapshotId":"2026-06-15"}'))
    ).toEqual({ isClosingPeriodData: false, collectionDate: null })
  })

  it('throws on unparseable metadata so the caller fails closed', () => {
    expect(() => parseSnapshotProvenance(Buffer.from('not json'))).toThrow()
    expect(() => parseSnapshotProvenance(Buffer.from('[]'))).toThrow()
  })
})
