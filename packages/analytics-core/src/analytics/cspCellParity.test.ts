/**
 * One rule for a Club Success Plan cell (#2327).
 *
 * Two paths read the raw CSP cell of a club-performance CSV:
 * - DataTransformer sets `club.cspSubmitted`, which `getCSPStatus` (and so
 *   `determineDistinguishedLevelAtSnapshot`) reads for club-level Distinguished;
 * - `getCSPStatusFromRecord` reads the raw record directly, for the
 *   confirmed-Distinguished rankings count (#2323) and the time series.
 *
 * They must agree on every cell value. TI's rule (Distinguished Club Program,
 * Item 1111, Rev. 06/2026, p. 5): a club must submit its Club Success Plan to
 * qualify, so only an affirmative cell counts — a blank cell means not
 * submitted. The affirmative spellings are the union of the ones the old
 * parsers accepted (Y, yes, true, 1, submitted). A missing CSP column
 * (pre-2025-26 exports) still reads as submitted, because the requirement
 * did not exist then.
 *
 * Observed real data (2026-10-28, single-object reads of 42 club-performance
 * CSVs, 2025-08-05 → 2026-10-27, D02/03/06/57/61/80/101/116): the cell is
 * only ever 'Y' or 'N'; no blank cell was seen.
 */

import { describe, it, expect } from 'vitest'
import { DataTransformer } from '../transformation/DataTransformer.js'
import { getCSPStatus, getCSPStatusFromRecord } from './ClubEligibilityUtils.js'

const HEADERS = [
  'Club Number',
  'Club Name',
  'Division',
  'Area',
  'Club Status',
  'CSP',
  'Active Members',
  'Goals Met',
]

async function clubLevelStatus(cell: string): Promise<boolean> {
  const stats = await new DataTransformer().transformRawCSV(
    '2026-10-27',
    '61',
    {
      clubPerformance: [
        HEADERS,
        ['1234', 'Test Club', 'A', '1', 'Active', cell, '25', '5'],
      ],
      divisionPerformance: [],
      districtPerformance: [],
    }
  )
  const club = stats.clubs[0]
  if (!club) throw new Error('expected one club')
  return getCSPStatus(club)
}

describe('CSP cell: one rule for both paths (#2327)', () => {
  const cases: Array<[cell: string, submitted: boolean]> = [
    ['Y', true],
    ['y', true],
    [' Y ', true],
    ['Yes', true],
    ['true', true],
    ['1', true],
    ['Submitted', true],
    ['N', false],
    ['n', false],
    ['No', false],
    ['false', false],
    ['0', false],
    ['Not Submitted', false],
    ['', false],
    ['   ', false],
  ]

  it.each(cases)(
    'cell %j → submitted=%s on the raw-record path',
    (cell, submitted) => {
      expect(getCSPStatusFromRecord({ CSP: cell })).toBe(submitted)
    }
  )

  it.each(cases)(
    'cell %j → submitted=%s on the club-level path',
    async (cell, submitted) => {
      expect(await clubLevelStatus(cell)).toBe(submitted)
    }
  )

  it('a missing CSP column reads as submitted on both paths', async () => {
    expect(getCSPStatusFromRecord({ 'Club Number': '1234' })).toBe(true)
    const stats = await new DataTransformer().transformRawCSV(
      '2024-10-27',
      '61',
      {
        clubPerformance: [
          ['Club Number', 'Club Name', 'Division', 'Area', 'Active Members'],
          ['1234', 'Test Club', 'A', '1', '25'],
        ],
        divisionPerformance: [],
        districtPerformance: [],
      }
    )
    const club = stats.clubs[0]
    if (!club) throw new Error('expected one club')
    expect(club.cspSubmitted).toBeUndefined()
    expect(getCSPStatus(club)).toBe(true)
  })
})
