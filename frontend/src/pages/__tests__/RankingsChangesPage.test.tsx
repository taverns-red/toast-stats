/**
 * Region and world What Changed pages (#2476, phase 1):
 * `/region/:n/changes` and `/regions/changes`, routed subpages (ADR-005).
 * The page owns the from/to pair (URL-synced, same presets and pickers as
 * the district page) over the dates of the per-district snapshot index the
 * district page reads, and passes the two dates' rankings rows down (R3).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RankingsChangesPage from '../RankingsChangesPage'
import {
  useRecordedDates,
  useRankingsPair,
} from '../../hooks/useRankingsChanges'
import type { RankingsDiffRow } from '../../utils/rankingsDiff'

vi.mock('../../hooks/useRankingsChanges', () => ({
  useRecordedDates: vi.fn(),
  useRankingsPair: vi.fn(),
}))
vi.mock('../../hooks/useDistrictRegionHistory', () => ({
  useDistrictRegionHistory: () => ({ history: null }),
}))
vi.mock('../../hooks/useMediaQuery', () => ({ useMediaQuery: () => false }))

const mockedDates = vi.mocked(useRecordedDates)
const mockedPair = vi.mocked(useRankingsPair)

const row = (
  districtId: string,
  region: string,
  paidClubs: number
): RankingsDiffRow => ({
  districtId,
  districtName: districtId,
  region,
  paidClubs,
  totalPayments: 1000,
  distinguishedClubs: 10,
  aggregateScore: 50,
  overallRank: 10,
})

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/region/:n/changes" element={<RankingsChangesPage />} />
        <Route path="/regions/changes" element={<RankingsChangesPage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedDates.mockReturnValue({
    dates: ['2026-10-01', '2026-10-15', '2026-10-31'],
    isLoading: false,
  })
  mockedPair.mockReturnValue({
    fromRows: [row('61', '05', 100), row('9', '07', 50)],
    toRows: [row('61', '05', 103), row('9', '07', 52)],
    isLoading: false,
    isError: false,
    missing: [],
  })
})

describe('RankingsChangesPage', () => {
  it('defaults a region to the previous → latest recorded pair', () => {
    renderAt('/region/05/changes')
    expect(mockedPair).toHaveBeenLastCalledWith('2026-10-15', '2026-10-31')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Region 05' })
    ).toBeInTheDocument()
    expect(screen.getByTestId('changes-headline')).toHaveTextContent(
      'Changes for Region 05 from Oct 15, 2026 to Oct 31, 2026'
    )
    expect(
      screen.getByRole('table', { name: 'Region 05 districts' })
    ).toHaveTextContent('District 61')
  })

  it('honours the URL pair and offers the district page’s presets', () => {
    renderAt('/region/05/changes?from=2026-10-01')
    expect(mockedPair).toHaveBeenLastCalledWith('2026-10-01', '2026-10-31')
    expect(screen.getByRole('combobox', { name: /from/i })).toBeInTheDocument()
  })

  it('renders the world view at /regions/changes', () => {
    renderAt('/regions/changes')
    expect(
      screen.getByRole('heading', { level: 1, name: 'All regions' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('table', { name: 'Changes by region' })
    ).toBeInTheDocument()
  })

  it('asks for two different dates rather than diffing a date with itself', () => {
    renderAt('/regions/changes?from=2026-10-31&to=2026-10-31')
    expect(screen.getByTestId('changes-same-date')).toBeInTheDocument()
    expect(mockedPair).toHaveBeenLastCalledWith(undefined, undefined)
  })

  it('says which date has no rankings file, never a zero diff', () => {
    mockedPair.mockReturnValue({
      fromRows: [],
      toRows: [],
      isLoading: false,
      isError: false,
      missing: ['2026-10-15'],
    })
    renderAt('/region/05/changes')
    expect(screen.getByTestId('changes-missing')).toHaveTextContent(
      'Oct 15, 2026'
    )
    expect(screen.queryByTestId('rankings-changes')).toBeNull()
  })

  it('says so when a region has no districts on either date', () => {
    renderAt('/region/99/changes')
    expect(screen.getByTestId('changes-empty-region')).toBeInTheDocument()
  })
})
