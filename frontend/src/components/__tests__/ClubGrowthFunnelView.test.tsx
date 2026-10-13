/**
 * ClubGrowthFunnelView (#1794) — the district Club Growth funnel. Values are
 * text (never colour alone), each stage links to its club list, unknown stages
 * say so instead of printing 0 (#1757), and no person data is rendered.
 */
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import type { DistrictReportsDataset } from '@taverns-red/shared-contracts'
import recorded from '../../__tests__/fixtures/d61-growth-reports.recorded.json'
import { buildClubGrowthFunnel } from '../../utils/clubGrowthFunnel'
import { ClubGrowthFunnelView } from '../ClubGrowthFunnelView'

const live = recorded.cdn_2026_10_11 as unknown as DistrictReportsDataset

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
    expect(section).toHaveTextContent(/payment incomplete/i)
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

  it('says why the suspended clubs are not listed', () => {
    renderView(2)
    const section = screen.getByRole('region', { name: /suspended/i })
    expect(section).toHaveTextContent(/count only/i)
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
