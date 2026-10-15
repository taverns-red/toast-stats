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

  it('lists prospective clubs with stage, days in stage and a TI link', () => {
    renderView(2)
    const section = screen.getByRole('region', { name: /prospective clubs/i })
    expect(section).toHaveTextContent('Application to Organize')
    const link = within(section).getByRole('link', {
      name: /Parole Chrétienne et Passionné de Dieu/,
    })
    expect(link).toHaveAttribute(
      'href',
      'https://www.toastmasters.org/Find-a-Club/28678700'
    )
    expect(section).toHaveTextContent('544 days')
    // Live: two prospective clubs have not paid (28679937, 28680099).
    expect(within(section).getAllByText('Incomplete')).toHaveLength(2)
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
})
