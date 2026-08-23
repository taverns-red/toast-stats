/**
 * summarizeClubHistoryGaps (#1437) — turns the hook's per-year skip reasons
 * into one sentence a reader can act on.
 *
 * Before this, "no snapshot for that year", "that collection failed" and "the
 * club is not in this district's snapshot" were pixel-identical: an empty
 * table under "No completed program years on file yet". The three are
 * different facts and only one of them means the club has no history.
 */

import { describe, it, expect } from 'vitest'
import { summarizeClubHistoryGaps, type ClubHistoryGap } from '../clubHistory'

function gap(overrides: Partial<ClubHistoryGap> = {}): ClubHistoryGap {
  return {
    startYear: 2022,
    label: '2022-2023',
    districtId: '70',
    yearEndDate: null,
    reason: 'district-absent',
    ...overrides,
  }
}

const opts = { districtLabel: 'District 70' }

describe('summarizeClubHistoryGaps (#1437)', () => {
  it('returns null when no year was skipped', () => {
    expect(summarizeClubHistoryGaps([], opts)).toBeNull()
  })

  it('names the district and the years it has no snapshot for', () => {
    const text = summarizeClubHistoryGaps(
      [
        gap({ startYear: 2024, label: '2024-2025' }),
        gap({ startYear: 2023, label: '2023-2024' }),
      ],
      opts
    )
    expect(text).toContain('District 70')
    expect(text).toContain('2024-2025')
    expect(text).toContain('2023-2024')
    expect(text).toMatch(/no snapshot/i)
    // The reformation is the reason a reader most needs pointed at.
    expect(text).toMatch(/another district|different district/i)
  })

  it('separates "club not in this district that year" from a missing snapshot', () => {
    const text = summarizeClubHistoryGaps(
      [
        gap({
          startYear: 2021,
          label: '2021-2022',
          reason: 'club-absent',
          yearEndDate: '2022-06-30',
        }),
      ],
      opts
    )
    expect(text).toMatch(/not in District 70/i)
    expect(text).toContain('2021-2022')
    expect(text).not.toMatch(/could not be loaded/i)
  })

  it('reports load failures as a load problem, not as missing history', () => {
    const text = summarizeClubHistoryGaps(
      [
        gap({
          startYear: 2020,
          label: '2020-2021',
          reason: 'snapshot-unavailable',
          yearEndDate: '2021-06-30',
        }),
        gap({
          startYear: 2019,
          label: '2019-2020',
          reason: 'snapshot-failed',
          yearEndDate: '2020-06-30',
        }),
      ],
      opts
    )
    expect(text).toMatch(/could not be loaded/i)
    expect(text).toContain('2020-2021')
    expect(text).toContain('2019-2020')
  })

  it('truncates a long year list rather than printing every one', () => {
    const gaps: ClubHistoryGap[] = Array.from({ length: 9 }, (_, i) =>
      gap({ startYear: 2016 + i, label: `${2016 + i}-${2017 + i}` })
    )
    const text = summarizeClubHistoryGaps(gaps, opts) ?? ''
    expect(text).toMatch(/\+\d+ more|and \d+ more/i)
  })
})
