/**
 * Edge behaviour of the manifest builders (#1743, plan P3-3) that the
 * golden fixture does not reach. Each case pins what the retired inline
 * `node -e` code did, so the move to scripts/manifests/ changes no output.
 */

import { describe, it, expect } from 'vitest'
import { datesIndexJson, rankingsManifestJson } from '../cdnManifests'
import { buildRankHistory } from '../rankHistory'
import { mergeSnapshotIndex, snapshotIndexFromListing } from '../snapshotIndex'

const AT = '2026-10-11T00:00:00.000Z'

describe('datesIndexJson', () => {
  it('an empty listing is zero dates, not one empty-string date', () => {
    const { json, count } = datesIndexJson('', AT)
    expect(count).toBe(0)
    expect(JSON.parse(json).dates).toEqual([])
  })
})

describe('rankingsManifestJson', () => {
  it('throws on a rankings file with no metadata, as the inline code did', () => {
    expect(() =>
      rankingsManifestJson('{"rankings":[]}', '2026-10-10', AT)
    ).toThrow()
  })
})

describe('buildRankHistory', () => {
  const file = (name: string, body: unknown) => ({
    name,
    read: () => JSON.stringify(body),
  })

  it('ignores non-json names and dedups a date, keeping the first row', () => {
    const r = buildRankHistory(
      [
        { name: 'notes.txt', read: () => 'not json' },
        file('2026-10-10.json', {
          metadata: { totalDistricts: 2 },
          rankings: [
            { districtId: '7', districtName: 'Seven', aggregateScore: 5 },
            { districtId: '7', districtName: 'Seven', aggregateScore: 1 },
          ],
        }),
      ],
      () => {}
    )
    expect(r.entries).toHaveLength(1)
    const entry = JSON.parse(r.entries[0].json)
    expect(entry.history).toEqual([
      {
        date: '2026-10-10',
        aggregateScore: 5,
        totalDistricts: 2,
        overallRank: 0,
      },
    ])
  })

  it('replaces a "District N" placeholder name with a later real one', () => {
    const r = buildRankHistory(
      [
        file('2026-10-09.json', {
          metadata: { totalDistricts: 1 },
          rankings: [{ districtId: '61', districtName: 'District 61' }],
        }),
        file('2026-10-10.json', {
          metadata: { totalDistricts: 1 },
          rankings: [{ districtId: '61', districtName: 'Sixty-One' }],
        }),
      ],
      () => {}
    )
    expect(JSON.parse(r.entries[0].json).districtName).toBe('Sixty-One')
  })

  it('a read failure skips that file only', () => {
    const skipped: string[] = []
    const r = buildRankHistory(
      [
        {
          name: '2026-10-09.json',
          read: () => {
            throw new Error('EISDIR')
          },
        },
        file('2026-10-10.json', {
          metadata: { totalDistricts: 1 },
          rankings: [{ districtId: '1', districtName: 'One' }],
        }),
      ],
      m => skipped.push(m)
    )
    expect(skipped).toEqual(['Skipping 2026-10-09.json: EISDIR'])
    expect(r.entries.map(e => e.districtId)).toEqual(['1'])
  })
})

describe('snapshotIndexFromListing', () => {
  it('excludes the district_{id}_reports.json sidecar (#1428)', () => {
    const { json } = snapshotIndexFromListing(
      [
        'gs://b/snapshots/2026-10-10/district_61.json',
        'gs://b/snapshots/2026-10-10/district_61_reports.json',
      ].join('\n'),
      AT
    )
    expect(Object.keys(JSON.parse(json).districts)).toEqual(['61'])
  })

  it('an empty listing yields an empty index', () => {
    const { json, summary } = snapshotIndexFromListing('', AT)
    expect(JSON.parse(json).districts).toEqual({})
    expect(summary).toBe('Generated snapshot index: 0 districts, 0 dates')
  })
})

describe('mergeSnapshotIndex', () => {
  it('does not duplicate a date already present', () => {
    const { json } = mergeSnapshotIndex(
      JSON.stringify({ generatedAt: '', districts: { '61': ['2026-10-10'] } }),
      '2026-10-10',
      '61',
      AT
    )
    expect(JSON.parse(json).districts['61']).toEqual(['2026-10-10'])
  })

  it('starts from the empty index the workflow writes when none exists', () => {
    const { json } = mergeSnapshotIndex(
      '{"generatedAt":"","districts":{}}',
      '2026-10-11',
      '61,F',
      AT
    )
    expect(JSON.parse(json)).toEqual({
      generatedAt: AT,
      districts: { '61': ['2026-10-11'], F: ['2026-10-11'] },
    })
  })
})
