/**
 * PY-scoped region membership (#1821). Fixture: the recorded prod
 * `config/district-region-history.json` (asOf 2026-10-18), trimmed to six
 * districts. D61 sat in Regions 06, 09 and 05; D10 is absent from 2026-2027.
 */
import { describe, it, expect } from 'vitest'
import { DistrictRegionHistorySchema } from '@taverns-red/shared-contracts'
import recorded from '../../__tests__/fixtures/district-region-history.recorded.json'
import {
  regionOfDistrict,
  regionMembershipFor,
  formerRegionRuns,
  shortProgramYear,
} from '../regionHistory'

const history = DistrictRegionHistorySchema.parse(recorded)

describe('regionOfDistrict', () => {
  it("reads the district's region for the program year", () => {
    expect(regionOfDistrict(history, '61', '2019-2020')).toBe('09')
    expect(regionOfDistrict(history, '61', '2024-2025')).toBe('05')
    expect(regionOfDistrict(history, '61', '2016-2017')).toBe('06')
  })

  it('matches a padded or unpadded district id', () => {
    expect(regionOfDistrict(history, '1', '2016-2017')).toBe('10')
    expect(regionOfDistrict(history, '01', '2018-2019')).toBe('02')
  })

  it('is null for a PY the district has no entry for, or no history', () => {
    expect(regionOfDistrict(history, '10', '2026-2027')).toBeNull()
    expect(regionOfDistrict(history, '999', '2019-2020')).toBeNull()
    expect(regionOfDistrict(null, '61', '2019-2020')).toBeNull()
  })
})

describe('regionMembershipFor', () => {
  it("uses the PY's own mapping over the row's region field", () => {
    const regionOf = regionMembershipFor(history, '2019-2020')
    // A row stamped with today's region still lands in its 2019-20 region.
    expect(regionOf({ districtId: '61', region: '05' })).toBe('09')
  })

  it("falls back to the row's (normalised) region when the PY has no entry", () => {
    const regionOf = regionMembershipFor(history, '2026-2027')
    expect(regionOf({ districtId: '10', region: '5' })).toBe('05')
    expect(
      regionMembershipFor(null, '2019-2020')({ districtId: '61', region: '9' })
    ).toBe('09')
  })
})

describe('formerRegionRuns', () => {
  it('lists the runs in other regions than the selected PY, oldest first', () => {
    expect(formerRegionRuns(history, '61', '2026-2027')).toEqual([
      {
        region: '06',
        firstProgramYear: '2016-2017',
        lastProgramYear: '2017-2018',
        ongoing: false,
      },
      {
        region: '09',
        firstProgramYear: '2018-2019',
        lastProgramYear: '2023-2024',
        ongoing: false,
      },
    ])
  })

  it('includes a later, ongoing run when viewing a past PY', () => {
    expect(formerRegionRuns(history, '61', '2019-2020')).toEqual([
      {
        region: '06',
        firstProgramYear: '2016-2017',
        lastProgramYear: '2017-2018',
        ongoing: false,
      },
      {
        region: '05',
        firstProgramYear: '2024-2025',
        lastProgramYear: '2026-2027',
        ongoing: true,
      },
    ])
  })

  it('a run that ended before the latest PY is not ongoing', () => {
    // D10 left the map after 2025-26 — its Region 05 run is closed.
    expect(formerRegionRuns(history, '10', '2019-2020')).toEqual([
      {
        region: '05',
        firstProgramYear: '2024-2025',
        lastProgramYear: '2025-2026',
        ongoing: false,
      },
    ])
  })

  it('is empty for no history or a district with no entry', () => {
    expect(formerRegionRuns(null, '61', '2019-2020')).toEqual([])
    expect(formerRegionRuns(history, '999', '2019-2020')).toEqual([])
  })
})

describe('shortProgramYear', () => {
  it('formats 2019-2020 as 2019-20', () => {
    expect(shortProgramYear('2019-2020')).toBe('2019-20')
    expect(shortProgramYear('weird')).toBe('weird')
  })
})
