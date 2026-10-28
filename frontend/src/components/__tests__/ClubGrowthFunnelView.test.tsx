/**
 * ClubGrowthFunnelView (#1794) — the district Club Growth funnel. Values are
 * text (never colour alone), each stage links to its club list, unknown stages
 * say so instead of printing 0 (#1757), and no person data is rendered.
 */
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import type {
  DistrictReportsDataset,
  SuspendedClub,
  SuspendedClubs,
} from '@taverns-red/shared-contracts'
import recorded from '../../__tests__/fixtures/d61-growth-reports.recorded.json'
import suspendedJson from '../../__tests__/fixtures/suspended-clubs-2026-10-13.recorded.json'
import checklistRecorded from '../../__tests__/fixtures/prospective-club-page.recorded.json'
import sponsorsRecorded from '../../__tests__/fixtures/sponsors-mentors-2026-06-01.recorded.json'
import { buildClubGrowthFunnel } from '../../utils/clubGrowthFunnel'
import { ClubGrowthFunnelView } from '../ClubGrowthFunnelView'

const live = recorded.cdn_2026_10_11 as unknown as DistrictReportsDataset
const suspendedRecorded = suspendedJson as unknown as SuspendedClubs

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

function renderView(suspended: number | null, chartered: number | null = 0) {
  const funnel = buildClubGrowthFunnel({
    districtId: '61',
    reports: live,
    counts: { chartered, suspended },
    programYear: { startDate: '2026-07-01', endDate: '2027-06-30' },
    asOfDate: '2026-10-11',
  })
  return render(
    <MemoryRouter>
      <ClubGrowthFunnelView funnel={funnel} asOfDate="2026-10-11" />
    </MemoryRouter>
  )
}

function renderSuspended(
  districtId: string,
  clubs: SuspendedClub[],
  count: number
) {
  const funnel = buildClubGrowthFunnel({
    districtId,
    reports: live,
    counts: { chartered: 0, suspended: count },
    programYear: { startDate: '2026-07-01', endDate: '2027-06-30' },
    asOfDate: '2026-10-13',
    suspendedClubs: clubs,
    // 1380016 has a club page here; the others link out to TI.
    clubPageIds: new Set(['1380016']),
  })
  return render(
    <MemoryRouter>
      <ClubGrowthFunnelView funnel={funnel} asOfDate="2026-10-13" />
    </MemoryRouter>
  )
}

describe('ClubGrowthFunnelView', () => {
  beforeEach(() => stubMobile(false))
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('shows the four stages in order with their values as text', () => {
    renderView(2)
    const funnel = screen.getByRole('list', { name: /club growth funnel/i })
    const stages = within(funnel).getAllByRole('listitem')
    expect(stages.map(s => s.textContent)).toEqual([
      expect.stringMatching(/Prospective.*8/),
      expect.stringMatching(/Chartered.*0/),
      expect.stringMatching(/Coached.*6/),
      expect.stringMatching(/Suspended.*2/),
    ])
  })

  it('links each stage to its club list on the page', () => {
    renderView(2)
    const funnel = screen.getByRole('list', { name: /club growth funnel/i })
    const hrefs = within(funnel)
      .getAllByRole('link')
      .map(a => a.getAttribute('href'))
    expect(hrefs).toEqual([
      '#growth-prospective',
      '#growth-chartered',
      '#growth-coached',
      '#growth-suspended',
    ])
    for (const id of hrefs) {
      expect(document.getElementById(id!.slice(1))).not.toBeNull()
    }
  })

  it('renders an unknown suspension count as unknown, not 0 (#1757)', () => {
    renderView(null)
    const stage = screen.getByTestId('growth-stage-suspended')
    expect(stage).toHaveTextContent(/unknown/i)
    expect(stage).not.toHaveTextContent(/\b0\b/)
  })

  it('lists prospective clubs with progress, waiting-on and an in-site link (#2303, #2388)', () => {
    renderView(2)
    const section = screen.getByRole('region', { name: /prospective clubs/i })
    const table = within(section).getByTestId('growth-prospective-table')
    const headers = within(table)
      .getAllByRole('columnheader')
      .map(h => h.textContent)
    expect(headers).toEqual([
      'Club',
      'Division / Area',
      'Progress',
      'Waiting on',
      'Payment',
    ])
    expect(section).not.toHaveTextContent(/Days in stage/)
    const link = within(section).getByRole('link', {
      name: /Parole Chrétienne et Passionné de Dieu/,
    })
    expect(link).toHaveAttribute(
      'href',
      '/district/61/growth/prospective/28678700'
    )
    expect(link).not.toHaveAttribute('target')
    // Live D61 cells list only #1, so the next step is not listed yet.
    expect(section).toHaveTextContent('1 of 6 steps complete')
    expect(section).toHaveTextContent(
      'Step #2 · Certificate & Remit · not listed yet · 544 days since the checklist last changed'
    )
    // Live: two prospective clubs have not paid (28679937, 28680099).
    expect(within(section).getAllByText('Incomplete')).toHaveLength(2)
  })

  it('describes the checklist honestly above the table (#2388)', () => {
    renderView(2)
    const section = screen.getByRole('region', { name: /prospective clubs/i })
    const note = within(section).getByTestId('growth-prospective-note')
    expect(note).toHaveTextContent('1 of 6 steps complete: 8')
    expect(note).toHaveTextContent(/checklist/i)
    expect(note).toHaveTextContent(/any order/i)
    expect(note).not.toHaveTextContent(/Stage \d/)
  })

  it('a recorded out-of-order checklist waits on the step that went back (D25, #2388)', () => {
    const reports =
      checklistRecorded.d25_reports as unknown as DistrictReportsDataset
    const funnel = buildClubGrowthFunnel({
      districtId: '25',
      reports,
      counts: { chartered: 0, suspended: 0 },
      programYear: { startDate: '2026-07-01', endDate: '2027-06-30' },
      asOfDate: '2026-10-27',
    })
    render(
      <MemoryRouter>
        <ClubGrowthFunnelView funnel={funnel} asOfDate="2026-10-27" />
      </MemoryRouter>
    )
    const rows = within(
      screen.getByTestId('growth-prospective-table')
    ).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('5 of 6 steps complete')
    expect(rows[1]).toHaveTextContent(
      'Step #2 · Certificate & Remit · 74 days since it changed'
    )
    expect(rows[2]).toHaveTextContent('3 of 6 steps complete')
    // No location text, ever.
    expect(document.body).not.toHaveTextContent(/MUST-NOT-RENDER/)
  })

  it('all six steps complete says so (#2388)', () => {
    const reports = structuredClone(
      checklistRecorded.d25_reports
    ) as unknown as DistrictReportsDataset
    reports.sections.prospectiveClubs!.records[0]!.prospect =
      '#1 Application to Organize Complete - 04/17/2026#2 Certificate & Remit Complete - 08/20/2026#3 Roster Complete - 06/30/2026#4 Officer Info Complete - 06/15/2026#5 Club Info Complete - 06/15/2026#6 Constitution & Bylaws Complete - 06/15/2026Payment Incomplete'
    const funnel = buildClubGrowthFunnel({
      districtId: '25',
      reports,
      counts: { chartered: 0, suspended: 0 },
      programYear: { startDate: '2026-07-01', endDate: '2027-06-30' },
      asOfDate: '2026-10-27',
    })
    render(
      <MemoryRouter>
        <ClubGrowthFunnelView funnel={funnel} asOfDate="2026-10-27" />
      </MemoryRouter>
    )
    const rows = within(
      screen.getByTestId('growth-prospective-table')
    ).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('6 of 6 steps complete')
    expect(rows[1]).toHaveTextContent('All 6 steps complete')
  })

  it('carries the page’s py and date into the prospective club link (R3, #2303)', () => {
    const funnel = buildClubGrowthFunnel({
      districtId: '61',
      reports: live,
      counts: { chartered: 0, suspended: 0 },
      programYear: { startDate: '2026-07-01', endDate: '2027-06-30' },
      asOfDate: '2026-10-11',
    })
    render(
      <MemoryRouter
        initialEntries={['/district/61/growth?py=2026&date=2026-10-11&x=1']}
      >
        <ClubGrowthFunnelView funnel={funnel} asOfDate="2026-10-11" />
      </MemoryRouter>
    )
    const section = screen.getByRole('region', { name: /prospective clubs/i })
    expect(
      within(section).getByRole('link', {
        name: /Parole Chrétienne et Passionné de Dieu/,
      })
    ).toHaveAttribute(
      'href',
      '/district/61/growth/prospective/28678700?py=2026&date=2026-10-11'
    )
  })

  it('links coached clubs to their club pages with status and since', () => {
    renderView(2)
    const section = screen.getByRole('region', { name: /coached clubs/i })
    const link = within(section).getByRole('link', {
      name: /FSA-Universite Laval/,
    })
    expect(link).toHaveAttribute('href', '/district/61/club/1269833')
    expect(section).toHaveTextContent(/active coach/i)
    expect(section).toHaveTextContent('Sep 30, 2026')
    expect(section).toHaveTextContent(/completed/i)
  })

  it('says the list is not available for a date without one — not "none"', () => {
    renderView(2)
    const section = screen.getByRole('region', { name: /suspended/i })
    expect(section).toHaveTextContent(/not available for this date/i)
    expect(section).not.toHaveTextContent(/no clubs suspended/i)
    expect(within(section).queryByRole('table')).toBeNull()
  })

  it('lists the recorded D83 suspended clubs with date and links', () => {
    renderSuspended('83', suspendedRecorded.districts['83']!, 3)
    const section = screen.getByRole('region', { name: /suspended/i })
    expect(section).toHaveAccessibleName(/suspended this program year \(3\)/i)
    const own = within(section).getByRole('link', {
      name: 'Travelers Toastmasters',
    })
    expect(own).toHaveAttribute('href', '/district/83/club/1380016')
    const ti = within(section).getByRole('link', {
      name: /Cartus Magnus Club/,
    })
    expect(ti).toHaveAttribute(
      'href',
      'https://www.toastmasters.org/Find-a-Club/00875053'
    )
    expect(ti).toHaveAccessibleName(/opens toastmasters\.org/i)
    expect(within(section).getAllByText('Oct 1, 2026')).toHaveLength(3)
    expect(section).toHaveTextContent('G / 74')
  })

  it('lists suspended clubs as tappable rows on phones', () => {
    stubMobile(true)
    renderSuspended('83', suspendedRecorded.districts['83']!, 3)
    const section = screen.getByRole('region', { name: /suspended/i })
    expect(within(section).queryByRole('table')).toBeNull()
    expect(section).toHaveTextContent(/Suspended Oct 1, 2026/)
    expect(
      within(section).getByRole('link', { name: /Travelers Toastmasters/ })
    ).toHaveAttribute('href', '/district/83/club/1380016')
  })

  it('says plainly when no club was suspended this program year', () => {
    renderSuspended('61', suspendedRecorded.districts['61']!, 0)
    const section = screen.getByRole('region', { name: /suspended/i })
    expect(section).toHaveTextContent(/no clubs suspended/i)
    expect(section).not.toHaveTextContent(/not available/i)
  })

  it('says plainly when no club chartered yet this program year', () => {
    renderView(2, 0)
    const section = screen.getByRole('region', { name: /chartered/i })
    expect(section).toHaveTextContent(/no new clubs/i)
  })

  it('renders no contact data or coach identity', () => {
    const { container } = renderView(2)
    expect(container.textContent).not.toMatch(/@|\+1\d{10}|COACHU|PENDING/)
  })

  // #1794 + #1795 — sponsor/mentor COUNTS for new clubs, never who.
  it('says sponsor and mentor counts are not available yet without the section', () => {
    renderView(2)
    const section = screen.getByRole('region', { name: /chartered/i })
    expect(section).toHaveTextContent(/sponsors and mentors/i)
    expect(section).toHaveTextContent(/not available yet/i)
    expect(within(section).queryByTestId('growth-sponsors-table')).toBeNull()
  })

  it('lists sponsor and mentor counts per new club from the recorded section', () => {
    renderSponsors(false)
    const section = screen.getByRole('region', { name: /chartered/i })
    expect(section).not.toHaveTextContent(/not available yet/i)
    // Totals as text: 11 sponsors + 10 mentors (MENTOR + MENTORU) across 6
    // clubs; no 'other role' — every recorded code is a known role.
    expect(section).toHaveTextContent(/11 sponsors and 10 mentors across/)
    expect(section).toHaveTextContent(/6 new clubs/)
    expect(section).not.toHaveTextContent(/other role/i)
    expect(
      within(section).queryByRole('columnheader', { name: /other/i })
    ).toBeNull()
    const table = within(section).getByTestId('growth-sponsors-table')
    const link = within(table).getByRole('link', {
      name: 'iA Montreal Toastmasters',
    })
    expect(link).toHaveAttribute('href', '/district/61/club/28680300')
    const row = link.closest('tr')!
    expect(row).toHaveTextContent('May 22, 2026')
  })

  it('shows sponsor and mentor counts as tappable rows on phones', () => {
    renderSponsors(true)
    const section = screen.getByRole('region', { name: /chartered/i })
    expect(
      within(section).getByRole('link', { name: /iA Montreal Toastmasters/ })
    ).toHaveAttribute('href', '/district/61/club/28680300')
    expect(section).toHaveTextContent(/2 sponsors · 2 mentors/)
  })

  it('gives every phone row its full counts as its accessible name', () => {
    renderSponsors(true)
    const section = screen.getByRole('region', { name: /chartered/i })
    // The visible meta line may ellipsize at 375; the name never does.
    expect(
      within(section).getByRole('link', {
        name: 'Family Club, chartered Jun 25, 2025: 2 sponsors, 2 mentors, 4 awarded (opens toastmasters.org)',
      })
    ).toBeInTheDocument()
    expect(
      within(section).getByRole('link', {
        name: 'iA Montreal Toastmasters, chartered May 22, 2026: 2 sponsors, 2 mentors, 0 awarded',
      })
    ).toBeInTheDocument()
  })

  it('never renders a raw TI code or status, nor a person', () => {
    const { container } = renderSponsors(false)
    expect(container.textContent).not.toMatch(
      /MENTORU|SPONSOR\b|MENTOR\b|AWARDED|PENDING|@/
    )
  })
})

function renderSponsors(mobile: boolean) {
  stubMobile(mobile)
  const funnel = buildClubGrowthFunnel({
    districtId: '61',
    reports: {
      ...live,
      sections: {
        ...live.sections,
        sponsorsMentors: sponsorsRecorded.sponsorsMentors_2026_06_01,
      },
    },
    counts: { chartered: 0, suspended: 0 },
    programYear: { startDate: '2026-07-01', endDate: '2027-06-30' },
    asOfDate: '2026-10-11',
    clubPageIds: new Set(['28678571', '28680300']),
  })
  return render(
    <MemoryRouter>
      <ClubGrowthFunnelView funnel={funnel} asOfDate="2026-10-11" />
    </MemoryRouter>
  )
}
