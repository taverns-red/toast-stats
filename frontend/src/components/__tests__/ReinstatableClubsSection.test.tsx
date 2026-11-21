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
 * print no "Not known" division (S3); the split counts the unknown-effect
 * clubs (S6). #3115: every row links to its club page.
 *
 * #3118 (Ron, 2026-11-20): the "Adds to net club growth" group comes first
 * and open, "Raises the club base too" folds below; a net club growth line
 * follows the intro; the split and the first group's Why text use his
 * approved wording, verbatim.
 */
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import {
  normalizeClubId,
  type ReinstatableClub,
  type ReinstatableClubs,
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
    /* #3118 (Ron, 2026-11-20): the clubs that add to net club growth come
       first and open; the clubs that raise the club base too fold below,
       closed. Headings verbatim from the issue. */
    it('puts the net club growth group first, open, and folds the club base group closed below', () => {
      renderSection(d61)
      const rest = screen.getByTestId('growth-reinstate-rest')
      expect(rest.tagName).not.toBe('DETAILS')
      expect(rest.closest('details')).toBeNull()
      expect(
        within(rest).getByRole('heading', {
          name: 'Adds to net club growth (19)',
        })
      ).toBeInTheDocument()
      expect(
        within(rest)
          .getAllByRole('row')
          .filter(r => r.closest('tbody'))
      ).toHaveLength(19)

      const adds = screen.getByTestId('growth-reinstate-adds')
      expect(adds.tagName).toBe('DETAILS')
      expect(adds).not.toHaveAttribute('open')
      // The label is a heading inside the summary, so heading navigation
      // reaches the folded group too.
      const addsHeading = within(adds).getByRole('heading', {
        name: 'Raises the club base too (3)',
      })
      expect(addsHeading.closest('summary')).not.toBeNull()
      expect(
        within(adds)
          .getAllByRole('row', { hidden: true })
          .filter(r => r.closest('tbody'))
      ).toHaveLength(3)
      // The open group comes before the folded one in reading order.
      expect(
        rest.compareDocumentPosition(adds) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
      expect(section()).not.toHaveTextContent('Adds to the club base')
      expect(section()).not.toHaveTextContent('Doesn’t add to the club base')
      expect(screen.queryByTestId('growth-reinstate-unknown')).toBeNull()
    })

    it('renders no club base group when every club adds to net club growth', () => {
      renderSection(d61.slice(3))
      expect(screen.getByTestId('growth-reinstate-rest')).toBeInTheDocument()
      expect(screen.queryByTestId('growth-reinstate-adds')).toBeNull()
      expect(section()).not.toHaveTextContent('Raises the club base too')
    })

    it('renders no net club growth group when every club raises the club base', () => {
      renderSection(d61.slice(0, 3))
      expect(screen.queryByTestId('growth-reinstate-rest')).toBeNull()
      expect(section()).not.toHaveTextContent('Adds to net club growth')
      expect(
        within(screen.getByTestId('growth-reinstate-adds')).getByRole(
          'heading',
          { name: 'Raises the club base too (3)' }
        )
      ).toBeInTheDocument()
    })

    it('has no unknown-effect group: the pipeline’s answer decides (#3103)', () => {
      // Ron, 2026-11-20: the pipeline always places a suspension. An older
      // file's suspend_date_unexpected row (addsToBase false) folds with
      // the clubs that don't add.
      const adding: ReinstatableClub = { ...d61[0]!, clubNumber: '77' }
      renderSection([...d51, adding])
      expect(screen.queryByTestId('growth-reinstate-unknown')).toBeNull()
      expect(section()).not.toHaveTextContent('not known')
      const rest = screen.getByTestId('growth-reinstate-rest')
      expect(
        within(rest).getByText('HELP Synergy Toastmasters Club')
      ).toBeInTheDocument()
    })

    it('says the closed-club reason once, not on every row of its group', () => {
      renderSection(d61)
      const rest = screen.getByTestId('growth-reinstate-rest')
      const text = rest.textContent ?? ''
      expect(text.split('“will not increase the club base”')).toHaveLength(2)
      // #3118 item 5 (Ron, 2026-11-20): the FAQ quote, then what it means.
      // #3130 (Ron, 2026-11-21): the group note speaks for all of them.
      expect(rest).toHaveTextContent(
        'Closed. The FAQ says closed clubs “will not increase the club base”. So reinstating any of them adds to net club growth.'
      )
      expect(rest).not.toHaveTextContent(
        'So reinstating it adds to net club growth.'
      )
      expect(rowFor("Tunney's Toastmasters")).not.toHaveTextContent(
        'will not increase the club base'
      )
    })

    it('prints nothing about an oldest period, even from an older file that flags one (#3103)', () => {
      // Five periods now (Ron, 2026-11-20); files written before #3103
      // still set oldestPeriod on 9 of these rows.
      renderSection(d61)
      expect(d61.filter(c => c.oldestPeriod)).toHaveLength(9)
      expect(section()).not.toHaveTextContent(/oldest/i)
      expect(rowFor('Club Le Marquis')).not.toHaveTextContent(
        'Confirm with World Headquarters'
      )
    })
  })

  it('opens with Ron’s approved five-period intro (2026-11-20, #3103)', () => {
    renderSection(d61)
    expect(section()).toHaveTextContent(
      'A suspended or closed club can reinstate until the end of its fifth renewal period, counting the period it was suspended in. Toastmasters International makes the final call.'
    )
  })

  it('explains net club growth directly under the intro (Ron, 2026-11-20, #3118)', () => {
    renderSection(d61)
    const intro = screen.getByText(/A suspended or closed club can reinstate/)
    const next = intro.nextElementSibling
    expect(next?.textContent).toBe(
      'Net club growth is the number of paid clubs on June 30 minus the club base set on July 1. A Distinguished District needs net club growth of at least 1% of its club base.'
    )
  })

  const splitText = () =>
    screen.getByTestId('growth-reinstate-split').textContent

  describe('split line (#3118, Ron 2026-11-20)', () => {
    it('D61: both sentences, with the single reinstate-by date', () => {
      renderSection(d61)
      expect(splitText()).toBe(
        '19 of 22 add to net club growth if they reinstate. The other 3 would raise the club base too if they reinstate by March 31, 2027.'
      )
    })

    it('no club raises the club base: the first sentence only', () => {
      renderSection(d61.slice(3))
      expect(splitText()).toBe(
        '19 of 19 add to net club growth if they reinstate.'
      )
    })

    it('one club adds to net club growth: singular', () => {
      const closed = d61.slice(3, 4)
      renderSection([...closed, ...d61.slice(0, 3)])
      expect(splitText()).toBe(
        '1 of 4 adds to net club growth if it reinstates. The other 3 would raise the club base too if they reinstate by March 31, 2027.'
      )
    })

    it('one club raises the club base: singular', () => {
      renderSection([...d61.slice(3), d61[0]!])
      expect(splitText()).toBe(
        '19 of 20 add to net club growth if they reinstate. The other 1 would raise the club base too if it reinstates by March 31, 2027.'
      )
    })
  })

  describe('deadline (M1)', () => {
    it('names it in the Why cell of a September 30 suspension', () => {
      renderSection(d61)
      const row = rowFor('Toastmasters At St. Lawrence College')
      // The page's shared date format (formatDisplayDate), as the Suspended stage.
      expect(row).toHaveTextContent('Suspended Sep 30, 2026')
      expect(row).toHaveTextContent(
        'Suspended at the September 30 renewal. If it reinstates by March 31, 2027, the club base goes up by one too, so net club growth doesn’t change.'
      )
    })

    /* #3109 review (F1): an off-cycle suspend date (more than 3 days from
       March 31 or September 30) gets no deadline-specific Why sentence
       until Ron approves wording. Its group and the split's date stay. */
    describe('off-cycle suspend dates', () => {
      const offCycle = (over: Partial<ReinstatableClub>): ReinstatableClub => ({
        clubNumber: '7787247',
        clubName: 'Off Cycle Club',
        status: 'suspended',
        suspendDate: '2026-11-11',
        oldestPeriod: false,
        addsToBase: true,
        reason: 'suspended_sept30_october_cycle',
        ...over,
      })

      it('a November 11 suspension: no September 30 sentence, still adds by March 31', () => {
        renderSection([offCycle({})])
        const row = rowFor('Off Cycle Club')
        expect(row).toHaveTextContent('Suspended Nov 11, 2026')
        expect(row).not.toHaveTextContent('September 30 renewal')
        expect(row).not.toHaveTextContent('reinstates by')
        expect(
          within(screen.getByTestId('growth-reinstate-adds')).getByText(
            'Off Cycle Club'
          )
        ).toBeInTheDocument()
        expect(splitText()).toBe(
          '0 of 1 add to net club growth if they reinstate. The other 1 would raise the club base too if it reinstates by March 31, 2027.'
        )
      })

      it('a July 1 suspension (28678177): no March 31 sentence', () => {
        renderSection(
          [
            offCycle({
              clubNumber: '28678177',
              suspendDate: '2026-07-01',
              reason: 'suspended_mar31_before_oct1',
            }),
          ],
          { snapshotDate: '2026-08-15' }
        )
        expect(rowFor('Off Cycle Club')).not.toHaveTextContent(
          'March 31 renewal'
        )
      })

      it('TI’s day-after stamp (October 1) is on the cycle and keeps its sentence', () => {
        renderSection([offCycle({ suspendDate: '2026-10-01' })])
        expect(rowFor('Off Cycle Club')).toHaveTextContent(
          'Suspended at the September 30 renewal. If it reinstates by March 31, 2027'
        )
      })
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
        'Suspended at the March 31 renewal. If it reinstates by September 30, 2026, the club base goes up by one too, so net club growth doesn’t change.'
      )
      expect(splitText()).toBe(
        '0 of 1 add to net club growth if they reinstate. The other 1 would raise the club base too if it reinstates by September 30, 2026.'
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
        'Suspended at the March 31 renewal. Reinstating it adds a paid club without raising this year’s club base.'
      )
      expect(splitText()).toBe(
        '1 of 1 adds to net club growth if it reinstates.'
      )
      expect(screen.queryByTestId('growth-reinstate-adds')).toBeNull()
      const rest = screen.getByTestId('growth-reinstate-rest')
      expect(
        within(rest).getByRole('heading', {
          name: 'Adds to net club growth (1)',
        })
      ).toBeInTheDocument()
      expect(section()).not.toHaveTextContent(/next year/i)
    })

    it('from July 1: the March 31 suspension adds, by September 30', () => {
      renderSection([{ ...spring, suspendDate: '2027-03-31' }], {
        snapshotDate: '2027-07-01',
      })
      expect(rowFor('Spring Club')).toHaveTextContent(
        'Suspended at the March 31 renewal. If it reinstates by September 30, 2027, the club base goes up by one too, so net club growth doesn’t change.'
      )
      expect(splitText()).toBe(
        '0 of 1 add to net club growth if they reinstate. The other 1 would raise the club base too if it reinstates by September 30, 2027.'
      )
    })

    it('June 30: still doesn’t add', () => {
      renderSection([{ ...spring, suspendDate: '2027-03-31' }], {
        snapshotDate: '2027-06-30',
      })
      expect(splitText()).toBe(
        '1 of 1 adds to net club growth if it reinstates.'
      )
    })

    it('prints no single date when the deadlines differ', () => {
      renderSection([spring, d61[0]!], { snapshotDate: '2026-09-30' })
      const split = screen.getByTestId('growth-reinstate-split')
      expect(split.textContent).toBe(
        '0 of 2 add to net club growth if they reinstate. The other 2 would raise the club base too if they reinstate.'
      )
      expect(split).not.toHaveTextContent('reinstate by')
    })

    it('prints no date when no club adds', () => {
      renderSection(d61.slice(3))
      const split = screen.getByTestId('growth-reinstate-split')
      expect(split.textContent).toBe(
        '19 of 19 add to net club growth if they reinstate.'
      )
      expect(split).not.toHaveTextContent('reinstate by')
    })
  })

  it('the split never counts an unknown effect (#3103)', () => {
    renderSection(d51)
    const split = screen.getByTestId('growth-reinstate-split')
    expect(split.textContent).toBe(
      '1 of 1 adds to net club growth if it reinstates.'
    )
    expect(split).not.toHaveTextContent('not known')
  })

  it('shows no split for an empty list (#3088)', () => {
    renderSection([])
    expect(screen.queryByTestId('growth-reinstate-split')).toBeNull()
  })

  /* #3115 — since #3107 a closed club has a page too, so every row opens
     its club's page, and the club name is the row's one link: a stretched
     target over the whole row, one tab stop, named after the club. */
  describe('club links (#3115)', () => {
    const allBodyRows = () =>
      within(section())
        .getAllByRole('row', { hidden: true })
        .filter(r => r.closest('tbody') !== null)

    it('links every row to its club page, closed clubs included', () => {
      renderSection(d61)
      const rows = allBodyRows()
      expect(rows).toHaveLength(d61.length)
      expect(d61.some(c => c.status === 'closed')).toBe(true)
      for (const club of d61) {
        const link = screen.getByRole('link', {
          name: club.clubName,
          hidden: true,
        })
        expect(link).toHaveAttribute(
          'href',
          `/district/61/club/${normalizeClubId(club.clubNumber)}`
        )
      }
    })

    it('gives each row exactly one link, named after the club', () => {
      renderSection(d61)
      for (const row of allBodyRows()) {
        const links = within(row).getAllByRole('link', { hidden: true })
        expect(links).toHaveLength(1)
        const club = d61.find(c => c.clubName === links[0]?.textContent)
        expect(club).toBeDefined()
        expect(links[0]).toHaveClass('growth-reinstate__row-link')
      }
    })
  })

  /* Ron approved the final-period line on 2026-11-20 (#3103). It shows only
     on rows the pipeline puts in inactive period 5, with their
     lastChanceBy; a row placed from lastSeen alone has no period. */
  describe('last chance (inactive period 5)', () => {
    const LINE =
      'Last chance: must reinstate by March 31, 2027, or charter as a new club.'
    const closedRow = (over: Partial<ReinstatableClub>): ReinstatableClub => ({
      clubNumber: '3492',
      clubName: 'Period Club',
      status: 'closed',
      lastSeen: '2025-03-31',
      oldestPeriod: false,
      addsToBase: false,
      reason: 'closed_does_not_add',
      ...over,
    })

    it('a period-5 row says it must reinstate by its lastChanceBy', () => {
      renderSection([
        closedRow({ inactivePeriod: 5, lastChanceBy: '2027-03-31' }),
      ])
      expect(rowFor('Period Club')).toHaveTextContent(LINE)
    })

    it('a row with no period never says it', () => {
      renderSection([
        closedRow({ clubNumber: '9547', clubName: 'No Period Club' }),
      ])
      // The row, not the section: the section's example names a last
      // chance of its own (#3111).
      const row = rowFor('No Period Club')
      expect(row).not.toHaveTextContent('Last chance')
      expect(row).not.toHaveTextContent(/Period \d of 5/)
    })

    /* #3111 — Ron approved "Period 5 of 5. Last chance: March 31, 2027" for
       every row with a period. For the draft, period 5 merges it with the
       line above into one: "Period 5 of 5. Last chance: must reinstate by
       …, or charter as a new club." */
    it('a period-4 row says its period and last chance', () => {
      renderSection([
        closedRow({ inactivePeriod: 4, lastChanceBy: '2027-09-30' }),
      ])
      expect(
        rowFor('Period Club').querySelector('.growth-reinstate__period')
          ?.textContent
      ).toBe('Period 4 of 5. Last chance: September 30, 2027')
      expect(rowFor('Period Club')).not.toHaveTextContent('charter')
    })

    it('a period-5 row says it once, in one line', () => {
      renderSection([
        closedRow({ inactivePeriod: 5, lastChanceBy: '2027-03-31' }),
      ])
      const row = rowFor('Period Club')
      expect(row).toHaveTextContent(`Period 5 of 5. ${LINE}`)
      expect(row.textContent?.split('Last chance').length).toBe(2)
    })
  })

  /* #3111 — the generic window sits with the intro, before the lists. */
  describe('the five-period example', () => {
    it('follows the intro and comes before the club lists', () => {
      renderSection(d61)
      const example = within(section()).getByTestId('reinstate-window')
      expect(example).toHaveTextContent('Period 1')
      expect(example).not.toHaveTextContent('Now')
      const adds = within(section()).getByTestId('growth-reinstate-adds')
      expect(
        example.compareDocumentPosition(adds) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    })

    it('is not drawn when the date has no list', () => {
      renderSection(null)
      expect(screen.queryByTestId('reinstate-window')).toBeNull()
    })

    // Review of 09bb8f19c: nothing to explain when no club can reinstate.
    it('is not drawn when the list is empty', () => {
      renderSection([])
      expect(screen.queryByTestId('reinstate-window')).toBeNull()
      expect(screen.queryByText('How the five periods work')).toBeNull()
    })
  })

  /* Review of 09bb8f19c: on phones the period line spans the card, like
     the Why cell (growth.css, under 640px). */
  it('the status cell carries its own class for the phone layout', () => {
    renderSection([
      {
        clubNumber: '3492',
        clubName: 'Period Club',
        status: 'closed',
        lastSeen: '2025-03-31',
        addsToBase: false,
        reason: 'closed_does_not_add',
        inactivePeriod: 4,
        lastChanceBy: '2027-09-30',
      },
    ])
    const cell = rowFor('Period Club').querySelector('[data-label="Status"]')
    expect(cell).toHaveClass('growth-reinstate__status')
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
    const NOT_KNOWN = 'not known'
    const ADDS = 'Raises the club base too'
    const DOESNT = 'Adds to net club growth'

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
        why: 'If it reinstates by March 31, 2027, the club base goes up by one too, so net club growth doesn’t change.',
      },
      suspended_mar31_before_oct1: {
        row: { suspendDate: '2026-03-31', addsToBase: true },
        tag: ADDS,
        why: 'Suspended at the March 31 renewal. If it reinstates by',
      },
      suspended_mar31_after_oct1: {
        row: { suspendDate: '2026-03-31' },
        tag: DOESNT,
        why: 'Suspended at the March 31 renewal. The FAQ says the club closes on October 1, and a reinstatement after that “will not increase the club base.” So reinstating it adds to net club growth.',
      },
      suspended_sept30_past_october_cycle: {
        row: { suspendDate: '2025-09-30' },
        tag: DOESNT,
        why: 'Suspended at the September 30 renewal, and the October renewal cycle after it has ended. The club has likely closed by now, so reinstating won’t add to the club base. So reinstating it adds to net club growth. Confirm with World Headquarters.',
      },
      // #3103: emitted now only for an unparseable date; older files keep it.
      suspend_date_unexpected: {
        row: { suspendDate: '2026-06-15' },
        tag: DOESNT,
        why: 'isn’t at the end of a renewal period',
      },
      suspend_date_after_as_of: {
        row: { suspendDate: '2026-12-31' },
        tag: DOESNT,
        why: 'after this snapshot’s date',
      },
      // #3103: the pipeline's code for a March 31 suspension seen April to
      // June. Same sentence #3100 shows for that window.
      suspended_mar31_before_july1: {
        row: { suspendDate: '2026-03-31' },
        tag: DOESNT,
        why: 'Suspended at the March 31 renewal. Reinstating it adds a paid club without raising this year’s club base.',
      },
      closed_does_not_add: {
        row: {
          status: 'closed',
          suspendDate: undefined,
          lastSeen: '2026-06-30',
        },
        tag: DOESNT,
        // The group note says it (#3130); the row's own Why stays empty.
        why: 'Closed. The FAQ says closed clubs “will not increase the club base”. So reinstating any of them adds to net club growth.',
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

    it('an unknown code (a later release) follows the pipeline’s addsToBase and asks to confirm (#3103)', () => {
      const tr = renderOne(club('some_future_code', { addsToBase: true }))
      expect(section()).toHaveTextContent(`${ADDS} (1)`)
      expect(section()).not.toHaveTextContent(NOT_KNOWN)
      expect(confirmCount(tr)).toBe(1)
    })

    it('an unknown code flagged oldestPeriod by an older file says "Confirm" once and nothing about the period (#3103)', () => {
      const tr = renderOne(
        club('some_future_code', {
          status: 'closed',
          suspendDate: undefined,
          lastSeen: '2025-06-30',
          oldestPeriod: true,
        })
      )
      expect(section()).toHaveTextContent(`${DOESNT} (1)`)
      expect(tr).not.toHaveTextContent(/oldest/i)
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

  // #3130 (Ron, 2026-11-21): `adds` still counts the clubs that raise the
  // base; the card counts the clubs that add to net club growth.
  it('counts the recorded D61 clubs: 3 raise the base, 19 add to net club growth', () => {
    expect(reinstateSplit(d61, '2026-11-18')).toEqual({
      adds: 3,
      card: '19 add to net club growth',
    })
  })

  it('uses the singular for one club that adds to net club growth', () => {
    expect(
      reinstateSplit(
        [one('suspended_sept30_october_cycle', false)],
        '2026-11-18'
      )
    ).toEqual({ adds: 0, card: '1 adds to net club growth' })
  })

  it('says 0 when every club raises the base too', () => {
    expect(
      reinstateSplit(
        [one('suspended_sept30_october_cycle', true)],
        '2026-11-18'
      )
    ).toEqual({ adds: 1, card: '0 add to net club growth' })
  })

  it('does not count a March 31 suspension from April to June', () => {
    const spring = {
      ...one('suspended_mar31_before_oct1', true),
      suspendDate: '2027-03-31',
    }
    expect(reinstateSplit([spring], '2027-05-15').adds).toBe(0)
    expect(reinstateSplit([spring], '2027-07-01').adds).toBe(1)
  })

  it('counts the pipeline’s addsToBase, whatever the reason code (#3103)', () => {
    expect(
      reinstateSplit(
        [
          one('suspend_date_unexpected', true),
          one('suspend_date_after_as_of', false),
          one('some_future_code', true),
          one('suspended_mar31_before_july1', false),
        ],
        '2026-11-18'
      )
    ).toEqual({ adds: 2, card: '2 add to net club growth' })
  })
})

/* #3100 (S6) — the district card's third line, worded like the region and
   world card (#3094). */
describe('reinstateCard', () => {
  it('is the split alone when every effect is known', () => {
    expect(reinstateCard(d61, '2026-11-18')).toBe('19 add to net club growth')
  })

  it('counts a club the pipeline says doesn’t raise the base (#3103, #3130)', () => {
    expect(reinstateCard(d51, '2026-11-18')).toBe('1 adds to net club growth')
  })

  it('says 0 when no club can reinstate', () => {
    expect(reinstateCard([], '2026-11-18')).toBe('0 add to net club growth')
  })
})
