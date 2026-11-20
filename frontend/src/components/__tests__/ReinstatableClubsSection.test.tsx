/**
 * ReinstatableClubsSection (#3007, phase 3) — "Can reinstate" on the district
 * Club Growth page. Fixture: the staging 2026-11-18 file (D61: 3 suspended
 * clubs that add to the base, 19 closed clubs, 9 of them in the oldest
 * renewal period).
 *
 * Tags are plain text (never colour alone). Reasons quote Toastmasters'
 * Club Reinstatement FAQ. A missing file renders nothing; a measured zero
 * says so.
 *
 * #3100 (approved UX review items): clubs that add come first and the rest
 * fold into a closed <details> (S1); the adding rows and the split line name
 * the deadline (M1); "What it takes" says where to send it (M2); closed rows
 * print no "Not known" division (S3); a club with a page here links to it
 * (S4); the split counts the unknown-effect clubs (S6).
 */
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import type {
  ReinstatableClub,
  ReinstatableClubs,
} from '@taverns-red/shared-contracts'
import type { ReinstatementReason } from '@taverns-red/analytics-core'
import recordedJson from '../../__tests__/fixtures/reinstatable-clubs-2026-11-18.recorded.json'
import {
  ReinstatableClubsSection,
  reinstateCard,
  reinstateSplit,
  type ReinstatableClubsSectionProps,
} from '../ReinstatableClubsSection'

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

function renderSection(
  clubs: ReinstatableClub[] | null,
  over: Partial<ReinstatableClubsSectionProps> = {}
) {
  return render(
    <MemoryRouter>
      <ReinstatableClubsSection
        clubs={clubs}
        baseProgramYear="2026-2027"
        programYearStart={2026}
        snapshotDate="2026-11-18"
        districtId="61"
        {...over}
      />
    </MemoryRouter>
  )
}

function rowFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest('tr')
  if (!row) throw new Error(`no row for ${name}`)
  return row
}

const section = () => screen.getByTestId('growth-reinstate')

/** Body rows across every group's table. */
const bodyRows = () =>
  within(section())
    .getAllByRole('row')
    .filter(r => r.closest('tbody') !== null)

describe('ReinstatableClubsSection', () => {
  beforeEach(() => stubMobile(false))
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders nothing when the list was not measured', () => {
    const { container } = renderSection(null)
    expect(container).toBeEmptyDOMElement()
  })

  it('says so when the file lists no clubs for the district', () => {
    renderSection([])
    expect(
      screen.getByRole('heading', { name: 'Can reinstate (0)' })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/No suspended or recently closed clubs can reinstate/)
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('lists every recorded D61 club with its number', () => {
    renderSection(d61)
    expect(
      screen.getByRole('heading', { name: 'Can reinstate (22)' })
    ).toBeInTheDocument()
    expect(bodyRows()).toHaveLength(22)
    const row = rowFor('Toastmasters At St. Lawrence College')
    expect(row).toHaveTextContent('Club 1849755')
    expect(row).toHaveTextContent('A / 01')
  })

  describe('groups (S1)', () => {
    it('puts the clubs that add first, open, and folds the rest closed', () => {
      renderSection(d61)
      const adds = screen.getByTestId('growth-reinstate-adds')
      expect(
        within(adds).getByRole('heading', {
          name: 'Adds to the club base (3)',
        })
      ).toBeInTheDocument()
      expect(
        within(adds)
          .getAllByRole('row')
          .filter(r => r.closest('tbody'))
      ).toHaveLength(3)

      const rest = screen.getByTestId('growth-reinstate-rest')
      expect(rest.tagName).toBe('DETAILS')
      expect(rest).not.toHaveAttribute('open')
      // The label is a heading inside the summary, so heading navigation
      // reaches the folded group too.
      const restHeading = within(rest).getByRole('heading', {
        name: 'Doesn’t add to the club base (19)',
      })
      expect(restHeading.closest('summary')).not.toBeNull()
      expect(
        within(rest)
          .getAllByRole('row', { hidden: true })
          .filter(r => r.closest('tbody'))
      ).toHaveLength(19)
      // Adds come before the folded group in reading order.
      expect(
        adds.compareDocumentPosition(rest) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
      expect(screen.queryByTestId('growth-reinstate-unknown')).toBeNull()
    })

    it('gives the unknown-effect clubs their own group, after the adds', () => {
      const adding: ReinstatableClub = { ...d61[0]!, clubNumber: '77' }
      renderSection([...d51, adding])
      const unknown = screen.getByTestId('growth-reinstate-unknown')
      expect(
        within(unknown).getByRole('heading', {
          name: 'Effect on the club base not known (1)',
        })
      ).toBeInTheDocument()
      expect(
        within(unknown).getByText('HELP Synergy Toastmasters Club')
      ).toBeInTheDocument()
      const adds = screen.getByTestId('growth-reinstate-adds')
      expect(
        adds.compareDocumentPosition(unknown) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
      // No folded group when every club adds or is unknown.
      expect(screen.queryByTestId('growth-reinstate-rest')).toBeNull()
    })

    it('says the closed-club reason once, not on every folded row', () => {
      renderSection(d61)
      const rest = screen.getByTestId('growth-reinstate-rest')
      const text = rest.textContent ?? ''
      expect(text.split('“will not increase the club base”')).toHaveLength(2)
      expect(rowFor("Tunney's Toastmasters")).not.toHaveTextContent(
        'will not increase the club base'
      )
    })

    it('marks clubs in the oldest renewal period "Confirm with World Headquarters"', () => {
      renderSection(d61)
      expect(rowFor('Club Le Marquis')).toHaveTextContent(
        'Confirm with World Headquarters'
      )
      const oldest = d61.filter(c => c.oldestPeriod).length
      expect(oldest).toBe(9)
      const flagged = bodyRows().filter(r =>
        r.textContent?.includes('Confirm with World Headquarters')
      )
      expect(flagged).toHaveLength(oldest)
    })
  })

  describe('deadline (M1)', () => {
    it('names the March 31 deadline in the split for September 30 suspensions', () => {
      renderSection(d61)
      expect(screen.getByTestId('growth-reinstate-split')).toHaveTextContent(
        '3 of 22 add to the club base if they reinstate by March 31, 2027.'
      )
    })

    it('names it in the Why cell of a September 30 suspension', () => {
      renderSection(d61)
      const row = rowFor('Toastmasters At St. Lawrence College')
      // The page's shared date format (formatDisplayDate), as the Suspended stage.
      expect(row).toHaveTextContent('Suspended Sep 30, 2026')
      expect(row).toHaveTextContent(
        'Suspended at the September 30 renewal. If it reinstates by March 31, 2027, it adds to the club base.'
      )
    })

    it('takes the year from the snapshot date, not the calendar', () => {
      // A deadline year the default fixture date (2026-11-18) can't give.
      renderSection(d61, { snapshotDate: '2027-10-15' })
      expect(screen.getByTestId('growth-reinstate-split')).toHaveTextContent(
        'by March 31, 2028.'
      )
    })

    const spring: ReinstatableClub = {
      clubNumber: '1',
      clubName: 'Spring Club',
      status: 'suspended',
      suspendDate: '2026-03-31',
      oldestPeriod: false,
      addsToBase: true,
      reason: 'suspended_mar31_before_oct1',
    }

    it('names September 30 for a March 31 suspension, July to September', () => {
      // Ron approved this wording on 2026-11-20.
      renderSection([spring], { snapshotDate: '2026-07-31' })
      expect(rowFor('Spring Club')).toHaveTextContent(
        'Suspended at the March 31 renewal. If it reinstates by September 30, 2026, it adds to the club base.'
      )
      expect(screen.getByTestId('growth-reinstate-split')).toHaveTextContent(
        '1 of 1 adds to the club base if it reinstates by September 30, 2026.'
      )
    })

    /* Ron, 2026-11-20: always this year's club base. From April to June a
       March 31 suspension doesn't add to it, whatever the row's addsToBase
       flag says (the pipeline sets it for next year's base until #3103). */
    it('April to June: a March 31 suspension doesn’t add to this year’s base', () => {
      renderSection([{ ...spring, suspendDate: '2027-03-31' }], {
        snapshotDate: '2027-04-30',
      })
      expect(rowFor('Spring Club')).toHaveTextContent(
        'Suspended at the March 31 renewal. Reinstating it doesn’t change this year’s club base.'
      )
      expect(screen.getByTestId('growth-reinstate-split')).toHaveTextContent(
        '0 of 1 add to the club base.'
      )
      expect(screen.queryByTestId('growth-reinstate-adds')).toBeNull()
      const rest = screen.getByTestId('growth-reinstate-rest')
      expect(
        within(rest).getByRole('heading', {
          name: 'Doesn’t add to the club base (1)',
        })
      ).toBeInTheDocument()
      expect(section()).not.toHaveTextContent(/next year/i)
    })

    it('from July 1: the March 31 suspension adds, by September 30', () => {
      renderSection([{ ...spring, suspendDate: '2027-03-31' }], {
        snapshotDate: '2027-07-01',
      })
      expect(rowFor('Spring Club')).toHaveTextContent(
        'Suspended at the March 31 renewal. If it reinstates by September 30, 2027, it adds to the club base.'
      )
      expect(screen.getByTestId('growth-reinstate-split')).toHaveTextContent(
        '1 of 1 adds to the club base if it reinstates by September 30, 2027.'
      )
    })

    it('June 30: still doesn’t add', () => {
      renderSection([{ ...spring, suspendDate: '2027-03-31' }], {
        snapshotDate: '2027-06-30',
      })
      expect(screen.getByTestId('growth-reinstate-split')).toHaveTextContent(
        '0 of 1 add to the club base.'
      )
    })

    it('prints no single date when the deadlines differ', () => {
      renderSection([spring, d61[0]!], { snapshotDate: '2026-09-30' })
      const split = screen.getByTestId('growth-reinstate-split')
      expect(split).toHaveTextContent('2 of 2 add to the club base.')
      expect(split).not.toHaveTextContent('reinstate by')
    })

    it('prints no date when no club adds', () => {
      renderSection(d61.slice(3))
      const split = screen.getByTestId('growth-reinstate-split')
      expect(split).toHaveTextContent('0 of 19 add to the club base.')
      expect(split).not.toHaveTextContent('reinstate by')
    })
  })

  it('counts the clubs whose effect is not known in the split (S6)', () => {
    renderSection(d51)
    expect(screen.getByTestId('growth-reinstate-split')).toHaveTextContent(
      '0 of 1 add to the club base. 1 effect on the club base not known.'
    )
  })

  it('shows no split for an empty list (#3088)', () => {
    renderSection([])
    expect(screen.queryByTestId('growth-reinstate-split')).toBeNull()
  })

  describe('club links (S4)', () => {
    it('links a club that has a page here, as the Suspended list does', () => {
      renderSection(d61, {
        clubPageIds: new Set(['1849755', '3475582']),
      })
      expect(
        screen.getByRole('link', {
          name: 'Toastmasters At St. Lawrence College',
        })
      ).toHaveAttribute('href', '/district/61/club/1849755')
      expect(
        screen.getByRole('link', {
          name: "Tunney's Toastmasters",
          hidden: true,
        })
      ).toHaveAttribute('href', '/district/61/club/3475582')
    })

    it('leaves a club without a page here as plain text', () => {
      renderSection(d61, { clubPageIds: new Set(['1849755']) })
      expect(
        screen.queryByRole('link', {
          name: 'Speak with Style Toastmasters Club',
        })
      ).toBeNull()
      expect(
        screen.getByText('Speak with Style Toastmasters Club')
      ).toBeInTheDocument()
    })
  })

  describe('division and area (S3)', () => {
    it('prints no "Not known" for closed clubs without one', () => {
      renderSection(d61)
      expect(section()).not.toHaveTextContent('Not known')
      const cells = rowFor('Club Le Marquis').querySelectorAll(
        '[data-label="Division / Area"]'
      )
      expect(cells).toHaveLength(0)
    })

    it('shows a closed club’s division when the file has it', () => {
      const closed = d61.filter(c => c.status === 'closed')
      renderSection([
        ...closed.slice(1),
        { ...closed[0]!, division: 'G', area: '63' },
      ])
      expect(rowFor("Tunney's Toastmasters")).toHaveTextContent('G / 63')
      // Same table, a row without one: its cell is empty, never "Not known".
      expect(section()).not.toHaveTextContent('Not known')
    })
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
      renderSection([c])
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
        why: 'If it reinstates by March 31, 2027, it adds to the club base.',
      },
      suspended_mar31_before_oct1: {
        row: { suspendDate: '2026-03-31', addsToBase: true },
        tag: ADDS,
        why: 'Suspended at the March 31 renewal. If it reinstates by',
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
      '%s: shows its group and reason sentence',
      (reason, { row, tag, why }) => {
        const tr = renderOne(club(reason, row))
        expect(section()).toHaveTextContent(`${tag} (1)`)
        expect(section()).toHaveTextContent(why)
        expect(confirmCount(tr)).toBeLessThanOrEqual(1)
      }
    )

    it('an unknown code (a later release) says the effect is not known', () => {
      const tr = renderOne(club('some_future_code', { addsToBase: true }))
      expect(section()).toHaveTextContent(`${NOT_KNOWN} (1)`)
      expect(section()).not.toHaveTextContent(ADDS)
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
      expect(section()).toHaveTextContent(NOT_KNOWN)
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

  it('says what it takes and where to send it, and links the FAQ (M2)', () => {
    renderSection(d61)
    const note = screen.getByTestId('growth-reinstate-requirements')
    expect(
      within(note).getByRole('heading', { name: 'What it takes' })
    ).toBeInTheDocument()
    const items = within(note).getAllByRole('listitem')
    expect(items.map(li => li.textContent)).toEqual([
      'Membership applications for 12 members. 3 of them must have been members in the renewal period before the suspension.',
      'A president, a secretary and one vice president (education, membership or public relations). Three different people.',
      'Dues for each member: the rest of this renewal period, plus the next full one.',
    ])
    expect(note).toHaveTextContent(
      'Reinstatement can’t be done online. Email everything to renewals@toastmasters.org and pay World Headquarters by phone at +1 720-439-5050.'
    )
    expect(
      within(note).getByRole('link', { name: 'renewals@toastmasters.org' })
    ).toHaveAttribute('href', 'mailto:renewals@toastmasters.org')
    expect(
      within(note).getByRole('link', { name: '+1 720-439-5050' })
    ).toHaveAttribute('href', 'tel:+17204395050')
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
    expect(reinstateSplit(d61, '2026-11-18')).toEqual({
      adds: 3,
      card: '3 add to the club base',
    })
  })

  it('uses the singular for one club', () => {
    expect(
      reinstateSplit(
        [one('suspended_sept30_october_cycle', true)],
        '2026-11-18'
      )
    ).toEqual({ adds: 1, card: '1 adds to the club base' })
  })

  it('does not count a March 31 suspension from April to June', () => {
    const spring = {
      ...one('suspended_mar31_before_oct1', true),
      suspendDate: '2027-03-31',
    }
    expect(reinstateSplit([spring], '2027-05-15').adds).toBe(0)
    expect(reinstateSplit([spring], '2027-07-01').adds).toBe(1)
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
        '2026-11-18'
      )
    ).toEqual({ adds: 0, card: '0 add to the club base' })
  })
})

/* #3100 (S6) — the district card's third line, worded like the region and
   world card (#3094). */
describe('reinstateCard', () => {
  it('is the split alone when every effect is known', () => {
    expect(reinstateCard(d61, '2026-11-18')).toBe('3 add to the club base')
  })

  it('adds the unknown-effect count when there is one', () => {
    expect(reinstateCard(d51, '2026-11-18')).toBe(
      '0 add to the club base · 1 effect on the club base not known'
    )
  })
})
