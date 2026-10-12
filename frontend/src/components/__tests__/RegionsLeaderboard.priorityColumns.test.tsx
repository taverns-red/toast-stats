import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { RegionsLeaderboard } from '../RegionsLeaderboard'
import type { RegionRollup } from '../../utils/aggregateRegions'

/* #1834 — /regions leaderboard below 768 (593px in a 327px scroller, 45 %
   hidden): region + 2 chosen metrics via PriorityColumnsTable, sort still in
   ?sort=&dir= through the shared SortableHeader, full table in the sheet.
   ≥768 is covered unchanged by RegionsLeaderboard.test.tsx. */

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => true }))

afterEach(() => cleanup())

const Where = () => <output data-testid="where">{useLocation().search}</output>

const mkRollup = (overrides: Partial<RegionRollup>): RegionRollup => ({
  region: '01',
  districtCount: 8,
  paidClubs: 500,
  paidClubBase: 480,
  clubGrowthPercent: 4.16,
  paymentGrowthPercent: 9.09,
  totalPayments: 12000,
  paymentBase: 11000,
  distinguishedClubs: 200,
  distinguishedPercent: 40,
  clubsRank: 1,
  paymentsRank: 1,
  distinguishedRank: 1,
  aggregateScore: 1500,
  leadingDistrictId: '01',
  leadingDistrictName: 'District 01',
  requirements: {
    dspSubmitted: { met: 7, total: 8 },
    trainingMet: { met: 8, total: 8 },
    marketAnalysisSubmitted: { met: 6, total: 8 },
    communicationPlanSubmitted: { met: 7, total: 8 },
    regionAdvisorVisitMet: { met: 8, total: 8 },
  },
  ...overrides,
})

const ROLLUPS = [
  mkRollup({ region: '02', paidClubs: 700, aggregateScore: 900 }),
  mkRollup({ region: '01', paidClubs: 300, aggregateScore: 1100 }),
]

const renderAt = (url = '/regions') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <RegionsLeaderboard rollups={ROLLUPS} />
      <Where />
    </MemoryRouter>
  )

const table = () => screen.getByRole('table', { name: 'Region rankings' })
const headers = () =>
  within(table())
    .getAllByRole('columnheader')
    .map(th => th.textContent?.trim())
const firstColumn = () =>
  within(table())
    .getAllByRole('link')
    .map(a => a.getAttribute('href'))

describe('RegionsLeaderboard priority columns below 768 (#1834)', () => {
  it('shows region + Paid clubs + Score, no horizontal scroller', () => {
    renderAt()
    expect(headers()).toEqual(['Region', 'Paid clubs', 'Score'])
    expect(
      screen.queryByRole('region', { name: /scroll horizontally/i })
    ).toBeNull()
  })

  it('keeps the default region-number order and region links', () => {
    renderAt()
    expect(firstColumn()).toEqual(['/region/01', '/region/02'])
  })

  it('sorts through the shared header into ?sort=', () => {
    renderAt()
    fireEvent.click(
      within(table()).getByRole('button', { name: /Sort by Paid clubs/ })
    )
    // New-column clicks start descending on this table.
    expect(firstColumn()).toEqual(['/region/02', '/region/01'])
    expect(screen.getByTestId('where').textContent).toContain('sort=paidClubs')
  })

  it('swaps a metric by chip into ?cols=', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Districts' }))
    expect(headers()).toEqual(['Region', 'Score', 'Districts'])
    expect(screen.getByTestId('where').textContent).toContain(
      'cols=score%2Cdistricts'
    )
  })

  it('opens the complete 6-column table in the full-screen sheet', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: /full table/i }))
    const dialog = screen.getByRole('dialog', { name: /Regions/ })
    const region = within(dialog).getByRole('region')
    const full = within(region).getByRole('table')
    expect(within(full).getAllByRole('columnheader')).toHaveLength(6)
  })
})
