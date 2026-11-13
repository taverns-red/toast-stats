/**
 * Region district rankings on the shared DataTable (#2702, #2676, spec §14
 * M3).
 *
 * The 20-column region table was hand-rolled: sub-14px text, a two-row header
 * and a whole-row click, with no way to choose columns. It is now a TanStack
 * table rendered by the shared `DataTable`: the width tier picks the DEFAULT
 * set, the one Columns menu changes it, and a hidden column is absent from the
 * DOM. jsdom reports no media-query matches, so the tier here is the narrowest
 * (`tablet`).
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
import '@testing-library/jest-dom/vitest'
import RegionPage from '../RegionPage'
import { fetchCdnRankings } from '../../services/cdn'

vi.mock('../../services/cdn', () => ({
  fetchCdnDistrictRegionHistory: vi.fn().mockResolvedValue(null),
  fetchCdnDates: vi.fn().mockResolvedValue({ dates: [], count: 0 }),
  fetchCdnRankings: vi.fn(),
  fetchCdnRankingsForDate: vi.fn(),
  fetchCdnCompetitiveAwards: vi.fn().mockResolvedValue(null),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-05-12', generatedAt: 'x' }),
}))

const mockedFetchCdnRankings = vi.mocked(fetchCdnRankings)

const mk = (overrides: Record<string, unknown>) => ({
  districtId: '1',
  districtName: '1',
  region: '1',
  paidClubs: 100,
  paidClubBase: 90,
  totalPayments: 5000,
  paymentBase: 4500,
  distinguishedClubs: 50,
  aggregateScore: 300,
  overallRank: 1,
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

const rankings = [
  mk({ districtId: '86', districtName: 'D86', aggregateScore: 300 }),
  mk({
    districtId: '74',
    districtName: 'D74',
    aggregateScore: 200,
    overallRank: 5,
  }),
]

/** Shows where the router is, so a click that navigates can be seen. */
const LocationProbe = () => {
  const { pathname } = useLocation()
  return <output data-testid="location">{pathname}</output>
}

const setup = (path = '/region/1') =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ProgramYearProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/region/:n" element={<RegionPage />} />
            <Route path="*" element={null} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )

const rankingsTable = (): Promise<HTMLElement> =>
  screen.findByRole('table', { name: /region 0?1 district rankings/i })

const headerTexts = (table: HTMLElement): string[] =>
  Array.from(table.querySelectorAll('thead th')).map(
    th => th.textContent?.trim() ?? ''
  )

describe('RegionPage rankings on the DataTable (#2702)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mockedFetchCdnRankings.mockResolvedValue({
      rankings,
      asOfDate: '2025-11-22',
      generatedAt: '2025-11-22T00:00:00Z',
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('is a DataTable with a caption that says what and how many', async () => {
    setup()
    const table = await rankingsTable()
    expect(table).toHaveClass('dt')
    expect(table.querySelector('caption')?.textContent).toMatch(
      /region 0?1.*2 districts/i
    )
  })

  it('has no CSS-hidden columns: no __col--* class anywhere in the table', async () => {
    setup()
    const table = await rankingsTable()
    expect(table.querySelector('[class*="__col--"]')).toBeNull()
  })

  it('shows the narrowest-width default and leaves the rest out of the DOM', async () => {
    setup()
    const names = headerTexts(await rankingsTable())
    expect(names).toEqual(
      expect.arrayContaining(['Region rank', 'District', 'Score'])
    )
    expect(names).not.toContain('Tier')
    expect(names).not.toContain('Paid clubs base')
    expect(screen.queryByTestId('tier-cell')).toBeNull()
  })

  it('has one header row (no rowspan or colspan groups)', async () => {
    setup()
    const table = await rankingsTable()
    expect(table.querySelectorAll('thead tr')).toHaveLength(1)
    expect(table.querySelector('thead [rowspan], thead [colspan]')).toBeNull()
  })

  it('sets no text below the 14px floor on the table', async () => {
    setup()
    const table = await rankingsTable()
    expect(table.innerHTML).not.toMatch(/\btext-(?:xs|\[(?:9|1[0-3])px\])/)
  })

  it('makes the district cell the row header, with a real link', async () => {
    setup()
    const cell = (await screen.findAllByTestId('region-district-cell'))[0]!
    expect(cell.tagName).toBe('TH')
    expect(cell).toHaveAttribute('scope', 'row')
    expect(within(cell).getByRole('link')).toHaveAttribute(
      'href',
      '/district/86'
    )
  })

  it('has no whole-row click: the name link is the way in', async () => {
    setup()
    const cell = (await screen.findAllByTestId('region-district-cell'))[0]!
    const row = cell.closest('tr')!
    expect(row.className).not.toMatch(/cursor-pointer/)
    fireEvent.click(row)
    fireEvent.click(screen.getAllByTestId('score-cell')[0]!)
    expect(screen.getByTestId('location')).toHaveTextContent('/region/1')
    fireEvent.click(within(cell).getByRole('link'))
    expect(screen.getByTestId('location')).toHaveTextContent('/district/86')
  })

  it('offers a Columns menu that brings a hidden column back', async () => {
    setup()
    const table = await rankingsTable()
    expect(headerTexts(table)).not.toContain('Tier')
    fireEvent.click(screen.getByRole('button', { name: /^Columns,/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /^tier/i }))
    expect(headerTexts(table)).toContain('Tier')
    expect(screen.getAllByTestId('tier-cell')).toHaveLength(2)
  })

  it('shows a column the URL sorts by, even when the width hides it', async () => {
    setup('/region/1?sort=world-rank&dir=asc')
    const table = await rankingsTable()
    expect(headerTexts(table)).toContain('World rank')
  })
})
