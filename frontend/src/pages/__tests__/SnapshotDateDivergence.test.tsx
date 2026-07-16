/**
 * Snapshot-date divergence tests for DivisionPage + AreaPage (#1321, epic #1319
 * Sprint 2).
 *
 * `DistrictStatistics.asOfDate` is a PHANTOM — verified absent from the live CDN
 * envelope (`snapshots/2026-06-30/district_61.json` top-level keys are
 * `{districtId, districtName, collectedAt, status, data}`; the inner payload
 * carries `data.snapshotDate` and no `asOfDate` at either level). So
 * `extractDivisionPerformance(snapshot, snapshot.asOfDate)` passed `undefined`
 * and silently fell through to the `?? todayIso()` wall-clock fallback, which
 * gates `getCurrentVisitRound` / `getAreaVisitDeadlines`.
 *
 * The fixtures below are DIVERGENCE-BY-DEFAULT (the epic's layer 2): the wall
 * clock sits in July 2026 (PY 2026-2027) while the viewed snapshot is pinned to
 * 2026-05-01 (PY 2025-2026). Those two program years disagree, so a wall-clock
 * fallback renders the WRONG round's deadline. A fixture where the two dates
 * agree — as every pre-existing DivisionPage/AreaPage test had — cannot see this.
 *
 * The area fixture earns Distinguished but MISSED its 1st-round visit. Whether
 * that miss is a hard failure depends entirely on which program year's Nov 30
 * deadline you measure against — which makes the badge label a year-independent
 * discriminator (the tooltip is not: `formatShortDate` renders "May 31" with no
 * year at all):
 *   - pinned 2026-05-01 → PY 2025-2026 → Nov 30 2025 is PAST and unmet
 *       → "Not Distinguished" (missed-deadline) ✅
 *   - wall clock 2026-07-15 → PY 2026-2027 → Nov 30 2026 is still FUTURE
 *       → "Select Distinguished (Provisional)" ❌ — the wall clock silently
 *         whitewashes a missed deadline in a closed program year.
 */
import React from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import DivisionPage from '../DivisionPage'
import AreaPage from '../AreaPage'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

// District 61 snapshot index: PY2025 → 2025-08-01, 2026-05-01 (its latest);
// PY2026 → 2026-08-01 (the district's overall latest).
vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({
    data: {
      districtId: '61',
      dates: ['2025-08-01', '2026-05-01', '2026-08-01'],
      count: 3,
      dateRange: { startDate: '2025-08-01', endDate: '2026-08-01' },
    },
  })),
}))

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2025-08-01', '2026-05-01', '2026-08-01'],
    count: 3,
    generatedAt: '2026-08-02T00:00:00Z',
  }),
  fetchCdnRankings: vi.fn().mockResolvedValue({
    rankings: [],
    // The as-of (sourceCsvDate) date, deliberately DIVERGENT from the pinned
    // month-end below — the closing-window shape (#1315).
    asOfDate: '2026-08-05',
  }),
  fetchCdnManifest: vi.fn().mockResolvedValue({
    latestSnapshotDate: '2026-08-01',
  }),
}))

/**
 * Live wire shape: NO `asOfDate` key. Including one would re-create the exact
 * fiction this sprint deletes (Lesson 171 — mock the envelope the wire sends,
 * not the convenient shape).
 */
const SNAPSHOT = {
  divisionPerformance: [
    {
      Division: 'A',
      Area: '10',
      'Club Number': '123456',
      'Club Name': 'Ottawa Club',
      'Division Club Base': '1',
      'Area Club Base': '1',
      // 1st round MISSED, 2nd round done. Under PY 2025-2026 the Nov 30 2025
      // deadline has passed unmet (hard fail); under PY 2026-2027 Nov 30 2026
      // is still ahead (merely provisional).
      'Nov Visit award': '0',
      'May Visit award': '1',
    },
  ],
  clubPerformance: [
    {
      'Club Number': '123456',
      'Club Name': 'Ottawa Club',
      'Club Status': 'Active',
      'Club Distinguished Status': 'Select Distinguished',
    },
  ],
}

vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(() => ({
    data: SNAPSHOT,
    isLoading: false,
    error: null,
  })),
}))

const CLUB: ClubTrend = {
  clubId: '123456',
  clubName: 'Ottawa Club',
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: '10',
  areaName: 'Area 10',
  distinguishedLevel: 'Select',
  currentStatus: 'thriving',
  riskFactors: [],
  membershipTrend: [{ date: '2026-05-01', count: 25 }],
  dcpGoalsTrend: [{ date: '2026-05-01', goalsAchieved: 8 }],
}

vi.mock('../../hooks/useDistrictAnalytics', async () => {
  const actual = await vi.importActual<
    typeof import('../../hooks/useDistrictAnalytics')
  >('../../hooks/useDistrictAnalytics')
  return {
    ...actual,
    useDistrictAnalytics: vi.fn(() => ({
      data: { allClubs: [CLUB] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })),
  }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  // Wall clock in the NEW program year (2026-2027) while the viewed snapshot
  // stays pinned in the prior one — the July rollover + closing window.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-07-15T12:00:00Z'))
})

const renderAt = (url: string, path: string, element: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path={path} element={element} />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

describe('snapshot-date divergence — visit deadlines key on the SNAPSHOT (#1321)', () => {
  it('DivisionPage gates the area visit deadline on the pinned snapshot year, not the wall clock', async () => {
    renderAt(
      '/district/61/division/A?py=2025-2026',
      '/district/:districtId/division/:divId',
      <DivisionPage />
    )

    const badge = await screen.findByLabelText(/^Recognition status: /i)
    // PY 2025-2026's Nov 30 2025 round-1 deadline passed unmet → hard fail.
    expect(badge).toHaveTextContent('Not Distinguished')
    expect(badge).not.toHaveTextContent(/Provisional/i)
  })

  it('AreaPage gates the area visit deadline on the pinned snapshot year, not the wall clock', async () => {
    renderAt(
      '/district/61/division/A/area/10?py=2025-2026',
      '/district/:districtId/division/:divId/area/:areaId',
      <AreaPage />
    )

    const badge = await screen.findByLabelText(/recognition: /i)
    expect(badge).toHaveTextContent('Not Distinguished')
    expect(badge).not.toHaveTextContent(/Provisional/i)
  })
})

/**
 * The freshness pill on these pages was bound to the same phantom, so it fell
 * back to showing the pinned snapshot date and could never show the advancing
 * as-of date — silently hiding exactly the closing-window divergence it exists
 * to communicate. It now reads the global as-of date (#1310's shared source).
 *
 * Fixtures: district latest = global latest = 2026-08-01 (pinned), as-of =
 * 2026-08-05 (advanced).
 */
describe('freshness pill reads the global as-of date (#1321)', () => {
  it('DivisionPage shows the as-of date, not the pinned snapshot date, on the latest snapshot', async () => {
    renderAt(
      '/district/61/division/A',
      '/district/:districtId/division/:divId',
      <DivisionPage />
    )

    const pill = await screen.findByTestId('freshness-pill')
    expect(pill).toHaveTextContent('Aug 5, 2026')
    expect(pill).not.toHaveTextContent('Aug 1, 2026')
  })

  it('AreaPage shows the as-of date, not the pinned snapshot date, on the latest snapshot', async () => {
    renderAt(
      '/district/61/division/A/area/10',
      '/district/:districtId/division/:divId/area/:areaId',
      <AreaPage />
    )

    const pill = await screen.findByTestId('freshness-pill')
    expect(pill).toHaveTextContent('Aug 5, 2026')
    expect(pill).not.toHaveTextContent('Aug 1, 2026')
  })
})
