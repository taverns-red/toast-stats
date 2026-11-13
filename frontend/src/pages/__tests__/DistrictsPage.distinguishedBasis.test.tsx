/**
 * #2580 group 1: the landing KPI and the rankings table show the confirmed
 * Distinguished count as the headline, with "+N qualifying today" beside it
 * from the pipeline's region-rollups `distinguishedCounts` (#2553), and a
 * visible (touch-safe) note saying what the two mean.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import DistrictsPage from '../DistrictsPage'
import '../../__tests__/preloadRankingsTable'
import { fetchCdnRankings, fetchCdnRegionRollups } from '../../services/cdn'
import { renderWithProviders } from '../../__tests__/test-utils'
import { downloadCSV } from '../../utils/csvExport'

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
  fetchCdnRegionRollups: vi.fn(),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2025-11-22'),
  fetchCdnRegionMembershipSeries: vi.fn().mockResolvedValue(null),
  cdnAnalyticsUrl: vi.fn().mockReturnValue('https://cdn.taverns.red/test'),
  fetchFromCdn: vi.fn(),
}))

vi.mock('../../utils/csvExport', async importOriginal => ({
  ...(await importOriginal<typeof import('../../utils/csvExport')>()),
  downloadCSV: vi.fn(),
}))

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: () => ({
    data: { districts: [] },
    isLoading: false,
    isError: false,
  }),
}))

const tier = { confirmed: 0, provisional: 0 }
const counts = (confirmed: number, provisional: number) => ({
  confirmed,
  provisional,
  byTier: {
    distinguished: { confirmed, provisional },
    select: tier,
    presidents: tier,
    smedley: tier,
  },
})

const row = (districtId: string, region: string, overallRank: number) => ({
  districtId,
  districtName: `District ${districtId}`,
  region,
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

const rollups = {
  world: {
    distinguishedCounts: counts(75, 757),
    health: { thriving: 0, vulnerable: 0, interventionRequired: 0 },
    membership: 0,
    clubs: 0,
    growth: { prospective: 0, chartered: 0, suspended: 0 },
  },
  regions: null,
  districts: {
    '57': { distinguishedCounts: counts(25, 11) },
    '61': { distinguishedCounts: counts(25, 0) },
  },
}

describe('DistrictsPage — confirmed headline + qualifying today (#2580)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    vi.mocked(fetchCdnRankings).mockResolvedValueOnce({
      rankings: [row('57', '01', 1), row('61', '05', 2), row('83', '01', 3)],
      asOfDate: '2025-11-22',
      generatedAt: '2025-01-01T00:00:00Z',
    })
    vi.mocked(fetchCdnRegionRollups).mockResolvedValue(
      rollups as unknown as Awaited<ReturnType<typeof fetchCdnRegionRollups>>
    )
  })

  it('KPI: confirmed headline with +N qualifying today beside it, never summed', async () => {
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 57')
    const kpi = await screen.findByTestId('kpi-distinguished-clubs')
    await within(kpi).findByTestId('distinguished-provisional')
    expect(
      within(kpi).getByTestId('distinguished-confirmed')
    ).toHaveTextContent(/^75$/)
    expect(
      within(kpi).getByTestId('distinguished-provisional')
    ).toHaveTextContent('+757 qualifying today')
  })

  it('KPI without a published pair keeps the rankings sum and no extra', async () => {
    vi.mocked(fetchCdnRegionRollups).mockResolvedValue(null)
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 57')
    const kpi = await screen.findByTestId('kpi-distinguished-clubs')
    expect(
      within(kpi).getByTestId('distinguished-confirmed')
    ).toHaveTextContent(/^75$/)
    expect(within(kpi).queryByTestId('distinguished-provisional')).toBeNull()
  })

  it('table row: +N qualifying today under the confirmed count, not for 0 or unknown', async () => {
    renderWithProviders(<DistrictsPage />)
    const table = await screen.findByRole('table', {
      name: /district rankings/i,
    })
    fireEvent.click(screen.getByRole('button', { name: /^Columns,/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /distinguished/i }))
    const tr = within(table).getByTestId('district-row-57')
    expect(
      await within(tr).findByTestId('distinguished-provisional')
    ).toHaveTextContent('+11 qualifying today')
    const tr61 = within(table).getByTestId('district-row-61')
    expect(within(tr61).queryByTestId('distinguished-provisional')).toBeNull()
    const tr83 = within(table).getByTestId('district-row-83')
    expect(within(tr83).queryByTestId('distinguished-provisional')).toBeNull()
  })

  it('CSV: Distinguished Clubs stays confirmed, with its own qualifying-today column', async () => {
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 57')
    await screen.findByTestId('distinguished-basis-note')
    fireEvent.click(screen.getByRole('button', { name: /export csv/i }))
    expect(downloadCSV).toHaveBeenCalledTimes(1)
    const csv = vi.mocked(downloadCSV).mock.calls[0]![0]
    const [header, ...rows] = csv.split('\n')
    expect(header).toBe(
      'Rank,District,Region,Paid Clubs,Total Payments,Distinguished Clubs,Distinguished Qualifying Today,Aggregate Score'
    )
    const d57 = rows.find(r => r.includes('D57'))!.split(',')
    expect(d57[5]).toBe('25')
    expect(d57[6]).toBe('11')
    // Unknown is blank, not 0.
    const d83 = rows.find(r => r.includes('D83'))!.split(',')
    expect(d83[6]).toBe('')
  })

  it('shows the visible basis note once the figures are on the page', async () => {
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 57')
    expect(await screen.findByTestId('distinguished-basis-note')).toBeVisible()
  })
})
