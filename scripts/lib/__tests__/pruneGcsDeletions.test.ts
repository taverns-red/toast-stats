/**
 * Unit tests for scripts/lib/pruneGcsDeletions.ts (#1131)
 *
 * The prune workflow previously deleted GCS raw-csv dirs keyed by SNAPSHOT
 * dates (a local-vs-GCS snapshots/ listing diff). Remapped raw-csv dirs —
 * collection date ≠ snapshot date — were orphaned forever, and a raw-csv
 * dir sharing a date with an unrelated deleted snapshot could be deleted
 * wrongly. These pure functions derive the deletion lists directly from
 * the prune classification output, keyed by rawCsvDate AND snapshotDate.
 */

import { describe, it, expect } from 'vitest'
import {
  assertPruneDeletionScope,
  computePruneGcsDeletions,
  parsePruneOutput,
  PRUNE_DELETABLE_LAYERS,
  PRUNE_RETAINED_LAYERS,
  type PruneClassification,
} from '../pruneGcsDeletions'

const keep = (
  rawCsvDate: string,
  snapshotDate: string
): PruneClassification => ({ rawCsvDate, snapshotDate, keep: true })

const drop = (
  rawCsvDate: string,
  snapshotDate: string
): PruneClassification => ({ rawCsvDate, snapshotDate, keep: false })

describe('computePruneGcsDeletions', () => {
  it('keys raw-csv deletions by rawCsvDate, snapshot deletions by snapshotDate', () => {
    // A remapped non-keeper: collection date differs from snapshot date.
    const result = computePruneGcsDeletions([drop('2026-03-03', '2026-03-01')])

    expect(result.rawCsvDates).toEqual(['2026-03-03'])
    expect(result.snapshotDates).toEqual(['2026-03-01'])
  })

  it('deletes nothing for keepers', () => {
    const result = computePruneGcsDeletions([
      keep('2026-01-31', '2026-01-31'),
      keep('2026-02-03', '2026-01-31'),
    ])

    expect(result.rawCsvDates).toEqual([])
    expect(result.snapshotDates).toEqual([])
  })

  it('never deletes a snapshot date that a keeper still maps to', () => {
    // Defensive: keep is a function of snapshotDate so this split should
    // not occur, but a snapshot shared with any keeper must survive.
    const result = computePruneGcsDeletions([
      keep('2026-02-05', '2026-01-31'),
      drop('2026-02-03', '2026-01-31'),
    ])

    expect(result.rawCsvDates).toEqual(['2026-02-03'])
    expect(result.snapshotDates).toEqual([])
  })

  it('dedupes and sorts both lists', () => {
    const result = computePruneGcsDeletions([
      drop('2026-03-15', '2026-03-15'),
      drop('2026-03-10', '2026-03-10'),
      drop('2026-03-12', '2026-03-10'),
    ])

    expect(result.rawCsvDates).toEqual([
      '2026-03-10',
      '2026-03-12',
      '2026-03-15',
    ])
    expect(result.snapshotDates).toEqual(['2026-03-10', '2026-03-15'])
  })

  it('returns empty lists for empty input', () => {
    const result = computePruneGcsDeletions([])

    expect(result.rawCsvDates).toEqual([])
    expect(result.snapshotDates).toEqual([])
  })
})

describe('assertPruneDeletionScope (#1132)', () => {
  it('accepts strictly-dated paths under the deletable layers', () => {
    expect(() =>
      assertPruneDeletionScope(['raw-csv/2026-01-15', 'snapshots/2026-01-15'])
    ).not.toThrow()
    expect(() => assertPruneDeletionScope([])).not.toThrow()
  })

  it.each([
    'time-series/d61/2026-01-15.json',
    'club-trends/2026-01-15',
    'v1/rank-history/61.json',
  ])('rejects retained derived-layer path %s (#1132 ruling)', path => {
    expect(() => assertPruneDeletionScope([path])).toThrow(/#1132/)
  })

  it('rejects any path outside the allowlist, not just known derived layers (deny by default)', () => {
    expect(() => assertPruneDeletionScope(['config/districts.json'])).toThrow(
      /#1132/
    )
    expect(() => assertPruneDeletionScope(['v1/latest.json'])).toThrow(/#1132/)
  })

  it('rejects a deletable layer without a strict YYYY-MM-DD dir (glob/traversal can never pass)', () => {
    expect(() => assertPruneDeletionScope(['raw-csv/*'])).toThrow(/#1132/)
    expect(() => assertPruneDeletionScope(['snapshots/../v1'])).toThrow(/#1132/)
    expect(() => assertPruneDeletionScope(['raw-csv'])).toThrow(/#1132/)
    expect(() =>
      assertPruneDeletionScope(['snapshots/2026-01-15/extra'])
    ).toThrow(/#1132/)
  })

  it('names every violating path in the error so nothing fails silently', () => {
    expect(() =>
      assertPruneDeletionScope([
        'raw-csv/2026-01-15',
        'time-series/a.json',
        'club-trends/b.json',
      ])
    ).toThrow(/time-series\/a\.json.*club-trends\/b\.json/s)
  })

  it('declares the layer scope the prune is allowed to touch (#1132)', () => {
    expect(PRUNE_DELETABLE_LAYERS).toEqual(['raw-csv', 'snapshots'])
    expect(PRUNE_RETAINED_LAYERS).toEqual([
      'time-series',
      'club-trends',
      'v1/rank-history',
    ])
  })
})

describe('parsePruneOutput', () => {
  it('extracts classifications from the prune CLI JSON output', () => {
    const json = JSON.stringify({
      dryRun: false,
      totalDates: 2,
      classifications: [
        {
          rawCsvDate: '2026-01-31',
          snapshotDate: '2026-01-31',
          keep: true,
          reason: 'Month-end snapshot (2026-01-31)',
        },
        {
          rawCsvDate: '2026-01-15',
          snapshotDate: '2026-01-15',
          keep: false,
          reason: 'Non-month-end snapshot (2026-01-15)',
        },
      ],
    })

    const classifications = parsePruneOutput(json)

    expect(classifications).toHaveLength(2)
    expect(classifications[1]).toMatchObject({
      rawCsvDate: '2026-01-15',
      keep: false,
    })
  })

  it('throws on output without a classifications array (fail closed)', () => {
    expect(() => parsePruneOutput('{}')).toThrow(/classifications/)
    expect(() => parsePruneOutput('not json')).toThrow()
  })

  it('throws on classification entries missing required keys (fail closed)', () => {
    const json = JSON.stringify({
      classifications: [{ rawCsvDate: '2026-01-15', keep: false }],
    })

    expect(() => parsePruneOutput(json)).toThrow(/snapshotDate/)
  })

  it('throws on malformed dates so a glob can never reach gsutil rm (fail closed)', () => {
    const json = JSON.stringify({
      classifications: [
        { rawCsvDate: '*', snapshotDate: '2026-01-15', keep: false },
      ],
    })

    expect(() => parsePruneOutput(json)).toThrow(/rawCsvDate/)
  })

  it('rejects a malformed snapshotDate the same way', () => {
    const json = JSON.stringify({
      classifications: [
        { rawCsvDate: '2026-01-15', snapshotDate: '../latest', keep: false },
      ],
    })

    expect(() => parsePruneOutput(json)).toThrow(/snapshotDate/)
  })
})
