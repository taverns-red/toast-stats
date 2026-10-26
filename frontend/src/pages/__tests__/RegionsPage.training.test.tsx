import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import RegionsPage from '../RegionsPage'

/* #2330 — /regions shows each region's officer training (Round 1 and
   Round 2 at 4+ and all seven) beside the existing comparisons, plus a world
   figure, from ONE read of the date's region-rollups.json. The training
   distributions below are the real 2026-10-25 file's world, Region 01 and
   Region 05 blocks (cdn.taverns.red, read 2026-10-26). */

const cdn = vi.hoisted(() => ({
  series: null as unknown,
  rollups: null as unknown,
}))

const ROLLUPS_2026_10_25 = {
  snapshotDate: '2026-10-16',
  programYear: '2026-2027',
  world: {
    officerTraining: {
      round1: [1612, 498, 514, 547, 2777, 2569, 2218, 3798],
      round2: [14533, 0, 0, 0, 0, 0, 0, 0],
    },
  },
  regions: {
    '01': {
      districtIds: ['21'],
      officerTraining: {
        round1: [128, 66, 61, 66, 142, 193, 153, 232],
        round2: [1041, 0, 0, 0, 0, 0, 0, 0],
      },
    },
    '05': {
      districtIds: ['61'],
      officerTraining: {
        round1: [101, 43, 40, 56, 196, 181, 172, 183],
        round2: [972, 0, 0, 0, 0, 0, 0, 0],
      },
    },
  },
  districts: {},
}

vi.mock('../../services/cdn', async () => {
  const recorded = (
    await import('../../__tests__/fixtures/region-membership-series-2026-2027.recorded.json')
  ).default
  cdn.series = recorded
  const ranking = (region: string, districtId: string) => ({
    districtId,
    districtName: `District ${districtId}`,
    region,
    paidClubs: 50,
    paidClubBase: 48,
    clubGrowthPercent: 4,
    totalPayments: 2000,
    paymentBase: 1900,
    paymentGrowthPercent: 5,
    activeClubs: 50,
    distinguishedClubs: 20,
    selectDistinguished: 5,
    presidentsDistinguished: 3,
    distinguishedPercent: 40,
    clubsRank: 1,
    paymentsRank: 1,
    distinguishedRank: 1,
    overallRank: 1,
    aggregateScore: 100,
    smedleyDistinguished: 2,
    dspSubmitted: true,
    trainingMet: true,
    marketAnalysisSubmitted: true,
    communicationPlanSubmitted: true,
    regionAdvisorVisitMet: true,
    clubsWith20PlusMembers: 10,
    newCharteredClubs: 1,
    newPayments: 100,
    aprilPayments: 200,
    octoberPayments: 300,
    latePayments: 0,
    charterPayments: 0,
  })
  const rankings = {
    asOfDate: '2026-10-16',
    rankings: [ranking('01', '21'), ranking('05', '61')],
  }
  return {
    fetchCdnDates: vi.fn().mockResolvedValue({
      dates: ['2026-10-16'],
      count: 1,
      generatedAt: '2026-10-17T00:00:00Z',
    }),
    fetchCdnRankings: vi.fn().mockResolvedValue(rankings),
    fetchCdnRankingsForDate: vi.fn().mockResolvedValue(rankings),
    fetchCdnRegionMembershipSeries: vi.fn(async () => cdn.series),
    fetchCdnRegionRollups: vi.fn(async () => cdn.rollups),
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  cdn.rollups = ROLLUPS_2026_10_25
})
cdn.rollups = ROLLUPS_2026_10_25

const renderPage = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ProgramYearProvider>
        <MemoryRouter initialEntries={['/regions']}>
          <Routes>
            <Route path="/regions" element={<RegionsPage />} />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )

describe('RegionsPage officer training (#2330)', () => {
  it('shows each region’s Round 1 training, linking to its Training page', async () => {
    const { fetchCdnRegionRollups } = await import('../../services/cdn')
    renderPage()
    const table = await screen.findByRole('table', { name: 'Region rankings' })
    const r05 = await within(table).findByRole('link', {
      name: /^Region 05 Round 1: 75% of clubs with 4\+ officers/,
    })
    expect(r05).toHaveAttribute('href', '/region/05/training')
    expect(
      within(table).getByRole('link', {
        name: /^Region 01 Round 1: 69% of clubs with 4\+ officers/,
      })
    ).toBeInTheDocument()
    expect(
      within(table).getByRole('link', {
        name: /^Region 05 Round 1: 19% of clubs with all seven/,
      })
    ).toBeInTheDocument()
    // Round 2 opens Nov 1: no 0% figures before then.
    expect(within(table).getAllByText('not started')).toHaveLength(2)
    expect(fetchCdnRegionRollups).toHaveBeenCalledWith('2026-10-16')
  })

  it('gives the world figure for reference', async () => {
    renderPage()
    const world = await screen.findByTestId('regions-training-world')
    await within(world).findByText(/78% of clubs with 4\+ officers/)
    expect(world).toHaveTextContent(/26% with all seven/)
    expect(world).toHaveTextContent(/Round 2 \(Nov–Feb\): not started/)
  })

  it('a date without the rollups file says "not available", never 0%', async () => {
    cdn.rollups = null
    renderPage()
    const table = await screen.findByRole('table', { name: 'Region rankings' })
    await within(table).findAllByText('not available')
    expect(within(table).queryByText('0%')).toBeNull()
    expect(screen.getByTestId('regions-training-world')).toHaveTextContent(
      /not available for this date/
    )
  })
})
