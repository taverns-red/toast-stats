/**
 * RegionPage priority columns below 768 (#1834, mobile epic #1827).
 *
 * The 23-column region table hid 78 % of itself at 375 (1,451 px in a 325 px
 * scroller). Below 768 it becomes a PriorityColumnsTable: rank + district,
 * plus 2 metrics chosen by chip (`?cols=`), sortable through the shared
 * SortableHeader; the complete table lives in a full-screen sheet. ≥768 is
 * unchanged (covered by RegionPage.responsive / .sortable / .test).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import RegionPage from '../RegionPage'
import { fetchCdnCompetitiveAwards, fetchCdnRankings } from '../../services/cdn'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => true }))

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({ dates: [], count: 0 }),
  fetchCdnRankings: vi.fn(),
  fetchCdnRankingsForDate: vi.fn(),
  fetchCdnCompetitiveAwards: vi.fn().mockResolvedValue(null),
  // useCompetitiveAwards resolves "latest" through this when no date is set.
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2026-05-12'),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-05-12', generatedAt: 'x' }),
}))

const mockedFetchCdnRankings = vi.mocked(fetchCdnRankings)

const mkRanking = (overrides: Record<string, unknown>) => ({
  districtId: '1',
  districtName: '1',
  region: '7',
  paidClubs: 100,
  totalPayments: 5000,
  distinguishedClubs: 50,
  aggregateScore: 300,
  overallRank: 1,
  paidClubBase: 90,
  paymentBase: 4500,
  clubGrowthPercent: 10,
  paymentGrowthPercent: 10,
  activeClubs: 100,
  selectDistinguished: 20,
  presidentsDistinguished: 10,
  distinguishedPercent: 50,
  clubsRank: 1,
  paymentsRank: 1,
  distinguishedRank: 1,
  ...overrides,
})

const Where = () => <output data-testid="where">{useLocation().search}</output>

const renderRegion = () => {
  mockedFetchCdnRankings.mockResolvedValue({
    rankings: [
      mkRanking({ districtId: '7', aggregateScore: 300, paidClubs: 120 }),
      mkRanking({ districtId: '8', aggregateScore: 200, paidClubs: 140 }),
    ],
    asOfDate: '2026-05-12',
  } as never)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ProgramYearProvider>
        <MemoryRouter initialEntries={['/region/7']}>
          <Routes>
            <Route
              path="/region/:n"
              element={
                <>
                  <RegionPage />
                  <Where />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

const priorityTable = () =>
  screen.findByRole('table', { name: 'Region 7 district rankings' })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RegionPage priority columns below 768 (#1834)', () => {
  beforeEach(() => {
    renderRegion()
  })

  it('shows rank + district and 2 metrics — no horizontal scroller', async () => {
    const table = await priorityTable()
    const headers = within(table)
      .getAllByRole('columnheader')
      .map(th => th.textContent?.trim())
    expect(headers).toEqual(['Rank · District', 'Paid clubs', 'Payments'])
    expect(
      screen.queryByRole('region', { name: /scroll horizontally/i })
    ).toBeNull()
  })

  it('each row identity is a link to the district', async () => {
    const table = await priorityTable()
    const link = within(table).getByRole('link', { name: /D7/ })
    expect(link).toHaveAttribute('href', '/district/7')
    expect(link.textContent).toContain('#1')
  })

  it('sorts by a shown metric through the shared header, in the URL', async () => {
    const table = await priorityTable()
    fireEvent.click(
      within(table).getByRole('button', { name: /Sort by Paid clubs/ })
    )
    const firstLink = within(table).getAllByRole('link')[0]!
    expect(firstLink.textContent).toContain('D7') // 120 < 140 ascending
    expect(screen.getByTestId('where').textContent).toContain('sort=clubs')
  })

  it('a chip swaps a metric in and persists it as ?cols=', async () => {
    await priorityTable()
    fireEvent.click(screen.getByRole('button', { name: 'Tier' }))
    const headers = within(await priorityTable())
      .getAllByRole('columnheader')
      .map(th => th.textContent?.trim())
    expect(headers).toEqual(['Rank · District', 'Payments', 'Tier'])
    expect(screen.getByTestId('where').textContent).toContain(
      'cols=payments%2Ctier'
    )
  })

  it('Full table opens the complete 19-column table in a full-screen sheet', async () => {
    await priorityTable()
    fireEvent.click(screen.getByRole('button', { name: /full table/i }))
    const dialog = screen.getByRole('dialog', { name: /Region 7/ })
    const region = within(dialog).getByRole('region')
    expect(region).toHaveAttribute('tabindex', '0')
    const full = within(region).getByRole('table')
    // 2 header rows: 10 top cells + 12 sub-header cells; body rows 19 cells.
    const firstBodyRow = within(full).getAllByRole('row')[2]!
    expect(within(firstBodyRow).getAllByRole('cell').length).toBe(19)
    // Sticky identity columns ride along into the sheet.
    expect(
      within(full).getAllByTestId('region-rank-cell')[0]!.className
    ).toMatch(/region-rankings__sticky-col/)
  })
})

describe('RegionPage priority Tier column (#1834, Lesson 134)', () => {
  it('shows a short tier label that fits a third of a phone, full name for AT', async () => {
    vi.mocked(fetchCdnCompetitiveAwards).mockResolvedValueOnce({
      distinguishedDistrict: {
        '7': { districtId: '7', currentTier: 'Presidents' },
      },
    } as never)
    renderRegion()
    await priorityTable()
    fireEvent.click(screen.getByRole('button', { name: 'Tier' }))
    const chip = await screen.findByTestId('priority-tier-7')
    // The visible label is short; the full name is screen-reader-only text.
    expect(chip.querySelector('[aria-hidden="true"]')?.textContent).toBe(
      'Pres.'
    )
    expect(chip).toHaveAttribute('title', "President's Distinguished")
    expect(chip.querySelector('.sr-only')?.textContent).toBe(
      "President's Distinguished"
    )
  })
})
