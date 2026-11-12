/**
 * Landing rankings on the shared DataTable (#2689, #2676, spec §14 M1).
 *
 * The rankings table used to shed columns with CSS (`__col--compact/tablet/
 * desktop`), so a width could hide a metric with no way to get it back. It is
 * now a TanStack table rendered by the shared `DataTable`: the width tier picks
 * the DEFAULT set, one Columns menu changes it, and a hidden column is absent
 * from the DOM. jsdom reports no media-query matches, so the tier here is the
 * narrowest (`tablet`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { useLocation } from 'react-router-dom'
import '@testing-library/jest-dom'
import DistrictsPage from '../DistrictsPage'
import { fetchCdnRankings } from '../../services/cdn'
import { renderWithProviders } from '../../__tests__/test-utils'
import { storageKey } from '../../utils/localStorageStore'

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: [],
    count: 0,
    generatedAt: '2025-01-01T00:00:00Z',
  }),
  fetchCdnSnapshotIndex: vi.fn().mockResolvedValue({}),
  fetchCdnRankings: vi.fn(),
  fetchCdnManifest: vi.fn().mockResolvedValue({
    latestSnapshotDate: '2025-11-22',
    generatedAt: '2025-01-01T00:00:00Z',
  }),
  fetchCdnRegionRollups: vi.fn().mockResolvedValue(null),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2025-11-22'),
  fetchCdnRegionMembershipSeries: vi.fn().mockResolvedValue(null),
  cdnAnalyticsUrl: vi.fn().mockReturnValue('https://cdn.taverns.red/test'),
  fetchFromCdn: vi.fn(),
}))

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: () => ({
    data: { districts: [] },
    isLoading: false,
    isError: false,
  }),
}))

const mockedFetchCdnRankings = vi.mocked(fetchCdnRankings)

const row = (districtId: string, overallRank: number) => ({
  districtId,
  districtName: `District ${districtId}`,
  region: '01',
  paidClubs: 100,
  paidClubBase: 90,
  clubGrowthPercent: 11.1,
  totalPayments: 5000,
  paymentBase: 5200,
  paymentGrowthPercent: -3.8,
  activeClubs: 100,
  distinguishedClubs: 25,
  selectDistinguished: 10,
  presidentsDistinguished: 5,
  distinguishedPercent: 25,
  clubsRank: overallRank,
  paymentsRank: overallRank,
  distinguishedRank: overallRank,
  aggregateScore: 300 - overallRank,
  overallRank,
})

/** Shows where the router is, so a click that navigates can be seen. */
const LocationProbe = () => {
  const { pathname } = useLocation()
  return <output data-testid="location">{pathname}</output>
}

const setup = (entries: string[] = ['/']) => {
  mockedFetchCdnRankings.mockResolvedValue({
    rankings: [row('57', 1), row('61', 2), row('83', 3)],
    asOfDate: '2025-11-22',
    generatedAt: '2025-01-01T00:00:00Z',
  })
  return renderWithProviders(
    <>
      <DistrictsPage />
      <LocationProbe />
    </>,
    { initialEntries: entries }
  )
}

const headerTexts = (table: HTMLElement): string[] =>
  Array.from(table.querySelectorAll('thead th')).map(
    th => th.textContent?.trim() ?? ''
  )

describe('DistrictsPage rankings on the DataTable (#2689)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('names the table with a caption and a data-table id', async () => {
    setup()
    const table = await screen.findByRole('table', {
      name: /district rankings/i,
    })
    expect(table).toHaveClass('dt')
    expect(table.querySelector('caption')?.textContent).toMatch(
      /district rankings/i
    )
  })

  it('has no CSS-hidden columns: no __col--* class anywhere in the table', async () => {
    const { container } = setup()
    await screen.findByTestId('district-row-57')
    expect(container.querySelector('[class*="__col--"]')).toBeNull()
  })

  it('shows the narrowest width default: rank, district, score and two metrics', async () => {
    setup()
    const table = await screen.findByRole('table', {
      name: /district rankings/i,
    })
    const names = headerTexts(table)
    expect(names).toEqual(expect.arrayContaining(['District', 'Rank', 'Score']))
    // Absent from the DOM, not hidden by CSS.
    expect(names).not.toContain('Distinguished')
  })

  it('writes headers in sentence case', async () => {
    setup()
    const table = await screen.findByRole('table', {
      name: /district rankings/i,
    })
    const names = headerTexts(table)
    expect(names).toContain('Paid clubs')
    expect(names).toContain('Total payments')
    expect(names).not.toContain('Paid Clubs')
    expect(names).not.toContain('Total Payments')
  })

  it('offers one Columns menu that brings a hidden column back', async () => {
    setup()
    const table = await screen.findByRole('table', {
      name: /district rankings/i,
    })
    fireEvent.click(screen.getByRole('button', { name: /^Columns,/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /distinguished/i }))
    expect(headerTexts(table)).toContain('Distinguished')
  })

  it('shows a column the URL sorts by, even when the width hides it', async () => {
    setup(['/?sort=distinguished&dir=desc'])
    const table = await screen.findByRole('table', {
      name: /district rankings/i,
    })
    expect(headerTexts(table)).toContain('Distinguished')
  })

  it('makes the district cell the row header, with a real link', async () => {
    setup()
    const cell = await screen.findByTestId('district-cell-57')
    expect(cell.tagName).toBe('TH')
    expect(cell).toHaveAttribute('scope', 'row')
    const link = within(cell).getByRole('link')
    expect(link).toHaveAttribute('href', '/district/57')
  })

  it('marks my district with visible text and no yellow tint', async () => {
    window.localStorage.setItem(
      storageKey('my-district-id'),
      JSON.stringify('61')
    )
    setup()
    const mine = await screen.findByTestId('district-row-61')
    expect(within(mine).getByText('Your district')).toBeVisible()
    expect(mine.className).not.toMatch(/yellow/)
    expect(mine).toHaveAttribute('data-mine', 'true')
    expect(
      within(screen.getByTestId('district-row-57')).queryByText('Your district')
    ).toBeNull()
  })

  it('has no whole-row click: clicking a row (not its link) goes nowhere', async () => {
    setup()
    const rowEl = await screen.findByTestId('district-row-57')
    expect(rowEl.className).not.toMatch(/cursor-pointer/)
    expect(screen.getByTestId('location')).toHaveTextContent('/')
    fireEvent.click(within(rowEl).getByTestId('rank-cell-57'))
    fireEvent.click(rowEl)
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
    // The district link is the way in.
    fireEvent.click(within(rowEl).getByRole('link', { name: /57/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/district/57')
  })
})
