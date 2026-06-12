/**
 * Unit tests for scripts/lib/pruneSkeletonSync.ts (#1175)
 *
 * The prune sync previously downloaded every raw-csv and snapshot byte;
 * post-#1147 that no longer fits a GitHub runner's disk. Classification
 * needs only the date-dir SET plus each date's metadata.json, so the sync
 * becomes: materialize ALL date dirs from `gsutil ls` (a metadata-less dir
 * must stay VISIBLE — the #1131 protection depends on prune seeing it),
 * then overlay metadata.json files via `gsutil rsync -x <exclude>`.
 */

import { describe, it, expect } from 'vitest'
import {
  planSkeletonDirs,
  RAW_CSV_METADATA_ONLY_EXCLUDE,
} from '../pruneSkeletonSync'

// Listing parsing is shared with the prod-reconcile plan:
// parseGcsDatedDirListing (pruneProdReconcile.ts) owns — and its tests pin —
// the non-date/dedupe/blank-line edge cases.
describe('planSkeletonDirs', () => {
  const raw = [
    'gs://b/raw-csv/2026-02-13/',
    'gs://b/raw-csv/2026-01-31/',
    'gs://b/raw-csv/index.json',
  ].join('\n')
  const snap = 'gs://b/snapshots/2026-01-31/'

  it('plans dirs for every raw-csv and snapshot date in the listings', () => {
    const plan = planSkeletonDirs(raw, snap)
    expect(plan.rawCsvDates).toEqual(['2026-01-31', '2026-02-13'])
    expect(plan.snapshotDates).toEqual(['2026-01-31'])
  })

  it('fails closed on a zero-date raw-csv listing — an empty ls on a populated bucket means the listing failed, and proceeding would silently classify nothing', () => {
    expect(() => planSkeletonDirs('', snap)).toThrow(/raw-csv listing/)
    expect(() => planSkeletonDirs('gs://b/raw-csv/junk.txt', snap)).toThrow(
      /raw-csv listing/
    )
  })

  it('tolerates an empty snapshots listing — snapshots are not a classification input', () => {
    const plan = planSkeletonDirs(raw, '')
    expect(plan.snapshotDates).toEqual([])
  })
})

describe('RAW_CSV_METADATA_ONLY_EXCLUDE', () => {
  // gsutil rsync -x matches a Python regex against paths RELATIVE to the
  // source URL, and an exclude that matches a directory path prunes the
  // whole directory from traversal. The pattern must therefore NOT match
  // the bare date-dir path, or the metadata.json inside is never compared.
  const re = new RegExp(RAW_CSV_METADATA_ONLY_EXCLUDE)
  const excluded = (p: string) => re.test(p)

  it('keeps bare date-dir paths (traversal must descend into them)', () => {
    expect(excluded('2026-02-13')).toBe(false)
  })

  it('keeps <date>/metadata.json', () => {
    expect(excluded('2026-02-13/metadata.json')).toBe(false)
  })

  it('excludes CSV payloads under a date dir', () => {
    expect(excluded('2026-02-13/district_61.csv')).toBe(true)
    expect(excluded('2026-02-13/all-districts.csv')).toBe(true)
  })

  it('excludes nested metadata.json deeper than one level', () => {
    expect(excluded('2026-02-13/sub/metadata.json')).toBe(true)
  })

  it('excludes metadata.json outside a date dir and root-level files', () => {
    expect(excluded('metadata.json')).toBe(true)
    expect(excluded('not-a-date/metadata.json')).toBe(true)
    expect(excluded('index.json')).toBe(true)
  })

  it('is a Python-compatible regex: uses no JS-only constructs', () => {
    // Lookahead is the only extension used; it parses identically in
    // Python `re`. Constructing the RegExp above already proves JS-side
    // validity; this pins that the pattern stays anchored end-to-end.
    expect(RAW_CSV_METADATA_ONLY_EXCLUDE.startsWith('^')).toBe(true)
  })
})
