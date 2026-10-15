/**
 * Which districts a snapshot's metadata records as a #1671 source gap
 * (#2038), and which per-district object a date-relative name belongs to.
 *
 * The error strings are the ones TransformService writes for a gap
 * (`<id>: Skipped: …`), as observed in staging metadata on 2026-10-14
 * (`snapshots/2018-03-31`, `snapshots/2017-01-31`).
 */
import { describe, it, expect } from 'vitest'
import { districtObjectId, sourceGapDistricts } from '../sourceGap.js'

const NOT_A_CSV = (id: string) =>
  `${id}: Skipped: club-performance.csv for district ${id} on 2017-02-08 is not a CSV (body is HTML (starts "<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML…"), not a CSV) — a gap, not zero clubs (#1671)`

describe('sourceGapDistricts', () => {
  it('reads the gap districts of the observed 2017-01-31 metadata', () => {
    expect(
      sourceGapDistricts({
        successfulDistricts: ['01', '02'],
        failedDistricts: ['102', 'U'],
        errors: [NOT_A_CSV('102'), NOT_A_CSV('U')],
      })
    ).toEqual(['102', 'U'])
  })

  it('accepts every gap message transform writes', () => {
    expect(
      sourceGapDistricts({
        successfulDistricts: [],
        failedDistricts: ['7', '8'],
        errors: [
          '7: Skipped: no club-performance.csv for district 7 on 2018-04-18 — a gap in the source, not zero clubs (#1671)',
          '8: Skipped: corrupt club-performance.csv for district 8 on 2018-04-18',
        ],
      })
    ).toEqual(['7', '8'])
  })

  it('does not take a failure without a gap reason', () => {
    expect(
      sourceGapDistricts({
        successfulDistricts: [],
        failedDistricts: ['U', '9'],
        errors: [
          'U: Raw CSV data not found for district U on 2018-03-31',
          '19: Skipped: corrupt club-performance.csv for district 19 on 2018-04-18',
        ],
      })
    ).toEqual([])
  })

  it('does not take a district that is also listed as successful', () => {
    expect(
      sourceGapDistricts({
        successfulDistricts: ['U'],
        failedDistricts: ['U'],
        errors: [NOT_A_CSV('U')],
      })
    ).toEqual([])
  })

  it('is empty for anything that is not metadata', () => {
    expect(sourceGapDistricts(undefined)).toEqual([])
    expect(sourceGapDistricts({ failedDistricts: 'U' })).toEqual([])
    expect(sourceGapDistricts({ failedDistricts: ['U'] })).toEqual([])
  })
})

describe('districtObjectId', () => {
  it('names the district of its snapshot and analytics files', () => {
    expect(districtObjectId('district_U.json')).toBe('U')
    expect(districtObjectId('district_102.json')).toBe('102')
    expect(districtObjectId('analytics/district_102_analytics.json')).toBe(
      '102'
    )
    expect(
      districtObjectId('analytics/district_U_club-trends-index.json')
    ).toBe('U')
  })

  it('is null for a date-level file', () => {
    for (const name of [
      'metadata.json',
      'manifest.json',
      'global-totals.json',
      'all-districts-rankings.json',
      'analytics/manifest.json',
      'district_U.json.tmp',
      'other/district_U.json',
    ]) {
      expect(districtObjectId(name)).toBeNull()
    }
  })
})
