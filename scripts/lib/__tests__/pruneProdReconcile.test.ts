import { describe, it, expect } from 'vitest'
import {
  parseGcsDatedDirListing,
  planProdReconcile,
} from '../pruneProdReconcile.js'

/**
 * planProdReconcile (#1133) — prod-reconciliation after a staging prune.
 *
 * Prod is never pruned (promotion rsync has no -d), so a staging prune
 * leaves prod a superset and freezes the count gate. The plan is the
 * prod-minus-staging diff of dated dirs per deletable layer — which also
 * covers stragglers from any earlier staging-only prune.
 *
 * Fail-closed: an empty staging listing, or disjoint snapshot listings,
 * aborts the plan — deleting from prod against a broken staging view is
 * exactly the catastrophe this tool must make impossible.
 */
describe('planProdReconcile', () => {
  const staging = {
    rawCsvDates: ['2026-01-31', '2026-02-28'],
    snapshotDates: ['2026-01-31', '2026-02-28'],
  }

  it('plans deletion of prod-only dated dirs per layer', () => {
    const plan = planProdReconcile({
      staging,
      prod: {
        rawCsvDates: ['2026-01-15', '2026-01-31', '2026-02-28'],
        snapshotDates: ['2026-01-15', '2026-01-31', '2026-02-28'],
      },
    })

    expect(plan.deletePrefixes).toEqual([
      'raw-csv/2026-01-15',
      'snapshots/2026-01-15',
    ])
  })

  it('returns an empty plan when prod matches staging', () => {
    const plan = planProdReconcile({ staging, prod: staging })
    expect(plan.deletePrefixes).toEqual([])
  })

  it('treats dates being pruned from staging this run as already gone (dry-run preview)', () => {
    const plan = planProdReconcile({
      staging: {
        rawCsvDates: ['2026-01-15', '2026-01-31'],
        snapshotDates: ['2026-01-15', '2026-01-31'],
      },
      prod: {
        rawCsvDates: ['2026-01-15', '2026-01-31'],
        snapshotDates: ['2026-01-15', '2026-01-31'],
      },
      pendingStagingDeletions: {
        rawCsvDates: ['2026-01-15'],
        snapshotDates: ['2026-01-15'],
      },
    })

    expect(plan.deletePrefixes).toEqual([
      'raw-csv/2026-01-15',
      'snapshots/2026-01-15',
    ])
  })

  it('never plans deletion of a date staging still has', () => {
    const plan = planProdReconcile({
      staging: {
        rawCsvDates: ['2026-01-31'],
        snapshotDates: ['2026-01-31'],
      },
      prod: {
        rawCsvDates: ['2026-01-31'],
        snapshotDates: ['2026-01-31'],
      },
    })
    expect(plan.deletePrefixes).toEqual([])
  })

  it('throws when the staging snapshot listing is empty (fail closed)', () => {
    expect(() =>
      planProdReconcile({
        staging: { rawCsvDates: ['2026-01-31'], snapshotDates: [] },
        prod: staging,
      })
    ).toThrow(/staging snapshots listing is empty/i)
  })

  it('throws when the staging raw-csv listing is empty (fail closed)', () => {
    expect(() =>
      planProdReconcile({
        staging: { rawCsvDates: [], snapshotDates: ['2026-01-31'] },
        prod: staging,
      })
    ).toThrow(/staging raw-csv listing is empty/i)
  })

  it('throws when snapshot listings are disjoint (wrong-bucket tripwire)', () => {
    expect(() =>
      planProdReconcile({
        staging: {
          rawCsvDates: ['2026-01-31'],
          snapshotDates: ['2026-01-31'],
        },
        prod: {
          rawCsvDates: ['2026-01-31'],
          snapshotDates: ['2020-05-31'],
        },
      })
    ).toThrow(/disjoint/i)
  })

  it('tolerates a prod bucket with no raw-csv layer at all', () => {
    const plan = planProdReconcile({
      staging,
      prod: {
        rawCsvDates: [],
        snapshotDates: ['2026-01-31', '2026-02-28'],
      },
    })
    expect(plan.deletePrefixes).toEqual([])
  })

  it('throws on a malformed date in any listing (nothing non-ISO can reach gsutil rm)', () => {
    expect(() =>
      planProdReconcile({
        staging,
        prod: {
          rawCsvDates: ['2026-01-31', 'garbage*'],
          snapshotDates: ['2026-01-31', '2026-02-28'],
        },
      })
    ).toThrow(/garbage/)
  })
})

describe('parseGcsDatedDirListing', () => {
  it('extracts dated dirs from gsutil ls output lines', () => {
    const listing = [
      'gs://toast-stats-data-ca/snapshots/2026-01-31/',
      'gs://toast-stats-data-ca/snapshots/2026-02-28/',
      '',
    ].join('\n')

    expect(parseGcsDatedDirListing(listing)).toEqual([
      '2026-01-31',
      '2026-02-28',
    ])
  })

  it('ignores non-dated entries (files, manifests) rather than deleting by accident', () => {
    const listing = [
      'gs://bucket/snapshots/2026-01-31/',
      'gs://bucket/snapshots/README.txt',
      'gs://bucket/snapshots/orphan-dir/',
    ].join('\n')

    expect(parseGcsDatedDirListing(listing)).toEqual(['2026-01-31'])
  })

  it('dedupes and sorts', () => {
    const listing = [
      'gs://bucket/raw-csv/2026-02-28/',
      'gs://bucket/raw-csv/2026-01-31/',
      'gs://bucket/raw-csv/2026-02-28/',
    ].join('\n')

    expect(parseGcsDatedDirListing(listing)).toEqual([
      '2026-01-31',
      '2026-02-28',
    ])
  })
})
