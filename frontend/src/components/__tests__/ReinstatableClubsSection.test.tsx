/**
 * ReinstatableClubsSection (#3007, phase 3) — "Can reinstate" on the district
 * Club Growth page. Fixture: the staging 2026-11-18 file (D61: 3 suspended
 * clubs that add to the base, 19 closed clubs, 9 of them in the oldest
 * renewal period).
 *
 * Tags are plain text (never colour alone). Reasons quote Toastmasters'
 * Club Reinstatement FAQ. A missing file renders nothing; a measured zero
 * says so.
 */
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import type {
  ReinstatableClub,
  ReinstatableClubs,
} from '@taverns-red/shared-contracts'
import type { ReinstatementReason } from '@taverns-red/analytics-core'
import recordedJson from '../../__tests__/fixtures/reinstatable-clubs-2026-11-18.recorded.json'
import * as SectionModule from '../ReinstatableClubsSection'

const { ReinstatableClubsSection } = SectionModule
const reinstateSplit = (
  clubs: ReinstatableClub[],
  nextYear: boolean
): unknown => {
  const fn = (SectionModule as Record<string, unknown>).reinstateSplit
  if (typeof fn !== 'function') throw new Error('reinstateSplit is missing')
  return fn(clubs, nextYear)
}

const recorded = recordedJson as unknown as ReinstatableClubs
const d61 = recorded.districts['61'] ?? []
const d51 = recorded.districts['51'] ?? []

function stubMobile(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
}

function rowFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest('tr')
  if (!row) throw new Error(`no row for ${name}`)
  return row
}

describe('ReinstatableClubsSection', () => {
  beforeEach(() => stubMobile(false))
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders nothing when the list was not measured', () => {
    const { container } = render(
      <ReinstatableClubsSection
        clubs={null}
        baseProgramYear={null}
        programYearStart={2026}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('says so when the file lists no clubs for the district', () => {
    render(
      <ReinstatableClubsSection
        clubs={[]}
        baseProgramYear="2026-2027"
        programYearStart={2026}
      />
    )
    expect(
      screen.getByRole('heading', { name: 'Can reinstate (0)' })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/No suspended or recently closed clubs can reinstate/)
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('lists every recorded D61 club with its number', () => {
    render(
      <ReinstatableClubsSection
        clubs={d61}
        baseProgramYear="2026-2027"
        programYearStart={2026}
      />
    )
    expect(
      screen.getByRole('heading', { name: 'Can reinstate (22)' })
    ).toBeInTheDocument()
    const table = screen.getByTestId('growth-reinstate-table')
    expect(within(table).getAllByRole('row')).toHaveLength(23)
    const row = rowFor('Toastmasters At St. Lawrence College')
    expect(row).toHaveTextContent('Club 1849755')
    expect(row).toHaveTextContent('A / 01')
  })

  it('says how many of the clubs add to the club base (#3088)', () => {
    render(
      <ReinstatableClubsSection
        clubs={d61}
        baseProgramYear="2026-2027"
        programYearStart={2026}
      />
    )
    expect(screen.getByTestId('growth-reinstate-split')).toHaveTextContent(
      '3 of 22 add to the club base.'
    )
  })

  it('names next year’s club base in the split from April to June (#3088)', () => {
    render(
      <ReinstatableClubsSection
        clubs={d61}
        baseProgramYear="2027-2028"
        programYearStart={2026}
      />
    )
    expect(screen.getByTestId('growth-reinstate-split')).toHaveTextContent(
      '3 of 22 add to next year’s club base.'
    )
  })

  it('shows no split for an empty list (#3088)', () => {
    render(
      <ReinstatableClubsSection
        clubs={[]}
        baseProgramYear="2026-2027"
        programYearStart={2026}
      />
    )
    expect(screen.queryByTestId('growth-reinstate-split')).toBeNull()
  })

  it('tags a suspended club that adds to the base, quoting the FAQ', () => {
    render(
      <ReinstatableClubsSection
        clubs={d61}
        baseProgramYear="2026-2027"
        programYearStart={2026}
      />
    )
    const row = rowFor('Toastmasters At St. Lawrence College')
    // The page's shared date format (formatDisplayDate), as the Suspended stage.
    expect(row).toHaveTextContent('Suspended Sep 30, 2026')
    expect(row).toHaveTextContent('Adds to the club base')
    expect(row).toHaveTextContent(
      '“Reinstatement during the October renewal cycle will increase the club base.”'
    )
  })

  it('tags a closed club as not adding, with its last-seen date', () => {
    render(
      <ReinstatableClubsSection
        clubs={d61}
        baseProgramYear="2026-2027"
        programYearStart={2026}
      />
    )
    const row = rowFor("Tunney's Toastmasters")
    expect(row).toHaveTextContent('Closed, last seen Jun 30, 2026')
    expect(row).toHaveTextContent('Doesn’t add to the club base')
    expect(row).toHaveTextContent('“will not increase the club base”')
    expect(row).not.toHaveTextContent('Confirm with World Headquarters')
  })

  it('marks clubs in the oldest renewal period "Confirm with World Headquarters"', () => {
    render(
      <ReinstatableClubsSection
        clubs={d61}
        baseProgramYear="2026-2027"
        programYearStart={2026}
      />
    )
    expect(rowFor('Club Le Marquis')).toHaveTextContent(
      'Confirm with World Headquarters'
    )
    const oldest = d61.filter(c => c.oldestPeriod).length
    expect(oldest).toBe(9)
    const flagged = within(screen.getByTestId('growth-reinstate-table'))
      .getAllByRole('row')
      .filter(r => r.textContent?.includes('Confirm with World Headquarters'))
    expect(flagged).toHaveLength(oldest)
  })

  it('shows a closed club with no known division or area as not known', () => {
    render(
      <ReinstatableClubsSection
        clubs={d61}
        baseProgramYear="2026-2027"
        programYearStart={2026}
      />
    )
    expect(rowFor('Club Le Marquis')).toHaveTextContent('Not known')
  })

  it('says the effect is not known for a suspend date off the renewal cycle', () => {
    render(
      <ReinstatableClubsSection
        clubs={d51}
        baseProgramYear="2026-2027"
        programYearStart={2026}
      />
    )
    const row = rowFor('HELP Synergy Toastmasters Club')
    expect(row).toHaveTextContent('Effect on the club base not known')
    expect(row).not.toHaveTextContent('Doesn’t add to the club base')
  })

  it('says "next year’s club base" when the base year is after the displayed year', () => {
    const club: ReinstatableClub = {
      clubNumber: '1',
      clubName: 'Spring Club',
      status: 'suspended',
      suspendDate: '2027-03-31',
      oldestPeriod: false,
      addsToBase: true,
      reason: 'suspended_mar31_before_oct1',
    }
    render(
      <ReinstatableClubsSection
        clubs={[club]}
        baseProgramYear="2027-2028"
        programYearStart={2026}
      />
    )
    expect(rowFor('Spring Club')).toHaveTextContent(
      'Adds to next year’s club base'
    )
  })

  describe('every reason code the pipeline can list', () => {
    const CONFIRM = 'Confirm with World Headquarters.'
    const NOT_KNOWN = 'Effect on the club base not known'
    const ADDS = 'Adds to the club base'
    const DOESNT = 'Doesn’t add to the club base'

    function club(
      reason: string,
      over: Partial<ReinstatableClub> = {}
    ): ReinstatableClub {
      return {
        clubNumber: '9',
        clubName: 'Reason Club',
        status: 'suspended',
        suspendDate: '2026-03-31',
        oldestPeriod: false,
        addsToBase: false,
        reason,
        ...over,
      }
    }

    function confirmCount(row: HTMLElement): number {
      return (row.textContent ?? '').split(CONFIRM).length - 1
    }

    function renderOne(c: ReinstatableClub): HTMLElement {
      render(
        <ReinstatableClubsSection
          clubs={[c]}
          baseProgramYear="2026-2027"
          programYearStart={2026}
        />
      )
      return rowFor(c.clubName)
    }

    // Typed against analytics-core's ReinstatementReason, minus the codes for
    // clubs that are not eligible (never listed). A new code without a row
    // here fails typecheck; the section must then map it too.
    type ListedReason = Exclude<
      ReinstatementReason,
      | 'closed_outside_window'
      | 'closed_last_seen_after_as_of'
      | 'closed_last_seen_invalid'
    >
    const CASES: Record<
      ListedReason,
      { row: Partial<ReinstatableClub>; tag: string; why: string }
    > = {
      suspended_sept30_october_cycle: {
        row: { suspendDate: '2026-09-30', addsToBase: true },
        tag: ADDS,
        why: '“Reinstatement during the October renewal cycle will increase the club base.”',
      },
      suspended_mar31_before_oct1: {
        row: { suspendDate: '2026-03-31', addsToBase: true },
        tag: ADDS,
        why: 'reinstating before October 1 increases the club base',
      },
      suspended_mar31_after_oct1: {
        row: { suspendDate: '2026-03-31' },
        tag: DOESNT,
        why: 'the club closes on October 1',
      },
      suspended_sept30_past_october_cycle: {
        row: { suspendDate: '2025-09-30' },
        tag: DOESNT,
        why: 'has likely closed',
      },
      suspend_date_unexpected: {
        row: { suspendDate: '2026-06-15' },
        tag: NOT_KNOWN,
        why: 'isn’t at the end of a renewal period',
      },
      suspend_date_after_as_of: {
        row: { suspendDate: '2026-12-31' },
        tag: NOT_KNOWN,
        why: 'after this snapshot’s date',
      },
      closed_does_not_add: {
        row: {
          status: 'closed',
          suspendDate: undefined,
          lastSeen: '2026-06-30',
        },
        tag: DOESNT,
        why: '“will not increase the club base”',
      },
    }

    it.each(Object.entries(CASES))(
      '%s: shows its tag and reason sentence',
      (reason, { row, tag, why }) => {
        const tr = renderOne(club(reason, row))
        expect(tr).toHaveTextContent(tag)
        expect(tr).toHaveTextContent(why)
        expect(confirmCount(tr)).toBeLessThanOrEqual(1)
      }
    )

    it('an unknown code (a later release) says the effect is not known', () => {
      const tr = renderOne(club('some_future_code', { addsToBase: true }))
      expect(tr).toHaveTextContent(NOT_KNOWN)
      expect(tr).not.toHaveTextContent(ADDS)
      expect(confirmCount(tr)).toBe(1)
    })

    it('an unknown code in the oldest period says "Confirm with World Headquarters" once', () => {
      const tr = renderOne(
        club('some_future_code', {
          status: 'closed',
          suspendDate: undefined,
          lastSeen: '2025-06-30',
          oldestPeriod: true,
        })
      )
      expect(tr).toHaveTextContent(NOT_KNOWN)
      expect(tr).toHaveTextContent('oldest of the four renewal periods')
      expect(confirmCount(tr)).toBe(1)
    })

    it('a Sept 30 suspension past the October cycle does not say the club has closed', () => {
      // The Status column says "Suspended"; the FAQ only fixes the closure
      // date for a March 31 suspension.
      const tr = renderOne(
        club('suspended_sept30_past_october_cycle', {
          suspendDate: '2025-09-30',
        })
      )
      expect(tr).toHaveTextContent('Suspended Sep 30, 2025')
      expect(tr).not.toHaveTextContent('so the club has closed')
      expect(tr).toHaveTextContent('has likely closed')
      expect(tr).toHaveTextContent(CONFIRM)
    })
  })

  it('explains what it takes, links the FAQ and says Toastmasters decides', () => {
    render(
      <ReinstatableClubsSection
        clubs={d61}
        baseProgramYear="2026-2027"
        programYearStart={2026}
      />
    )
    const note = screen.getByTestId('growth-reinstate-requirements')
    expect(note).toHaveTextContent('12 members')
    expect(note).toHaveTextContent('3 of whom were active')
    expect(note).toHaveTextContent('president, vice president and secretary')
    expect(note).toHaveTextContent('World Headquarters')
    const link = screen.getByRole('link', { name: /Club Reinstatement FAQ/ })
    expect(link).toHaveAttribute(
      'href',
      'https://toastmasters.org/footer/faq/Club'
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(
      screen.getByText(/Toastmasters International makes the final call/)
    ).toBeInTheDocument()
  })
})

/* #3088 — the split printed on the "Can reinstate" stage card. It counts the
   clubs tagged "Adds to the club base", so it can never disagree with the
   table's tags. */
describe('reinstateSplit', () => {
  const one = (reason: string, addsToBase: boolean): ReinstatableClub => ({
    clubNumber: `${reason}-${addsToBase}`,
    clubName: 'Split Club',
    status: 'suspended',
    suspendDate: '2026-09-30',
    oldestPeriod: false,
    addsToBase,
    reason,
  })

  it('counts the recorded D61 clubs that add to the base', () => {
    expect(reinstateSplit(d61, false)).toEqual({
      adds: 3,
      card: '3 add to the club base',
    })
  })

  it('uses the singular for one club and names next year’s base', () => {
    expect(
      reinstateSplit([one('suspended_sept30_october_cycle', true)], true)
    ).toEqual({ adds: 1, card: '1 adds to next year’s club base' })
  })

  it('does not count a club whose effect on the base is not known', () => {
    // Same rule as the table's tag: an undecided or unknown reason code is
    // "Effect on the club base not known", even if addsToBase is true.
    expect(
      reinstateSplit(
        [
          one('suspend_date_unexpected', true),
          one('suspend_date_after_as_of', true),
          one('some_future_code', true),
        ],
        false
      )
    ).toEqual({ adds: 0, card: '0 add to the club base' })
  })
})
