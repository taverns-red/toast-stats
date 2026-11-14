import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import DistrictChangesPage from '../DistrictChangesPage'
import { useDistrictCachedDates } from '../../hooks/useDistrictData'
import { useSnapshotDiff } from '../../hooks/useSnapshotDiff'
import { useRevisionPoints } from '../../hooks/useRevisionPoints'
import { useDistricts } from '../../hooks/useDistricts'
import { useTransferCounterparts } from '../../hooks/useTransferCounterparts'
import { useDistrictRanking } from '../../hooks/useDistrictRanking'
import { useDistinguishedCountsAt } from '../../hooks/useDistinguishedCountsAt'
import { buildSnapshotPoints } from '../../utils/snapshotPoints'
import { snap } from '../../test-utils/snapshotDate'
import type { ReconciliationRevisionIndex } from '@taverns-red/shared-contracts'

/* #2475 phase 1 — What Changed lists month-end reconciliation revisions.
   The page owns the pair (R3): URL tokens resolve against the points, an
   unknown @asOf falls back to the default, and during reconciliation the
   default is previous revision → latest revision. Outside reconciliation
   nothing changes. */

vi.mock('../../hooks/useDistrictData')
vi.mock('../../hooks/useDistricts')
vi.mock('../../hooks/useRevisionPoints', () => ({ useRevisionPoints: vi.fn() }))
vi.mock('../../hooks/useDistrictRanking', () => ({
  useDistrictRanking: vi.fn(),
}))
vi.mock('../../hooks/useDistinguishedCountsAt', () => ({
  useDistinguishedCountsAt: vi.fn(),
}))
vi.mock('../../hooks/useTransferCounterparts', () => ({
  useTransferCounterparts: vi.fn(),
}))
vi.mock('../../hooks/useSnapshotDiff', async () => {
  const actual = await vi.importActual<
    typeof import('../../hooks/useSnapshotDiff')
  >('../../hooks/useSnapshotDiff')
  return { ...actual, useSnapshotDiff: vi.fn() }
})

const mockedDates = vi.mocked(useDistrictCachedDates)
const mockedDiff = vi.mocked(useSnapshotDiff)
const mockedPoints = vi.mocked(useRevisionPoints)
const mockedRanking = vi.mocked(useDistrictRanking)

const DATES = ['2026-10-29', '2026-10-30', '2026-10-31'].map(snap)

const INDEX: ReconciliationRevisionIndex = {
  schemaVersion: 1,
  monthEnd: '2026-10-31',
  dataMonth: '2026-10',
  revisions: ['2026-11-02', '2026-11-03'].map(asOf => ({
    asOf,
    collectedAt: `${asOf}T10:00:00.000Z`,
    closing: true,
    successfulDistricts: ['61'],
  })),
  final: null,
}

function usePoints(index: ReconciliationRevisionIndex | null) {
  mockedPoints.mockReturnValue({
    ...buildSnapshotPoints(DATES, index, '61'),
    isLoading: false,
  })
}

function renderPage(entry = '/district/61/changes') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/district/:districtId/changes"
          element={<DistrictChangesPage />}
        />
      </Routes>
    </MemoryRouter>
  )
}

/** The (from, to) the page handed to the diff hook on its last render. */
function lastPair() {
  const call = mockedDiff.mock.calls[mockedDiff.mock.calls.length - 1]!
  return { from: call[1], to: call[2] }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useTransferCounterparts).mockReturnValue({
    counterparts: new Map(),
    deferred: new Set(),
    loadMore: vi.fn(),
  })
  mockedRanking.mockReturnValue({ ranking: null, isLoading: false })
  vi.mocked(useDistinguishedCountsAt).mockReturnValue({
    counts: null,
    isLoading: false,
  })
  vi.mocked(useDistricts).mockReturnValue({
    data: { districts: [{ id: '61', name: '61' }] },
  } as unknown as ReturnType<typeof useDistricts>)
  mockedDates.mockReturnValue({
    data: { dates: DATES },
    isLoading: false,
  } as unknown as ReturnType<typeof useDistrictCachedDates>)
  mockedDiff.mockReturnValue({
    data: undefined,
    isLoading: true,
    isError: false,
  } as unknown as ReturnType<typeof useSnapshotDiff>)
})

describe('DistrictChangesPage — month-end revisions (#2475)', () => {
  it('defaults to the previous revision → the latest revision while reconciling', () => {
    usePoints(INDEX)
    renderPage()
    expect(lastPair()).toEqual({
      from: { date: '2026-10-31', asOf: '2026-11-02' },
      to: '2026-10-31',
    })
    expect(screen.queryByTestId('changes-reversed')).toBeNull()
    expect(screen.queryByTestId('changes-same-date')).toBeNull()
  })

  it('deep-links a revision with ?to=<monthEnd>@<asOf>', () => {
    usePoints(INDEX)
    renderPage('/district/61/changes?from=2026-10-30&to=2026-10-31@2026-11-02')
    expect(lastPair()).toEqual({
      from: '2026-10-30',
      to: { date: '2026-10-31', asOf: '2026-11-02' },
    })
  })

  it('falls back to the default for an @asOf that is not in the index', () => {
    usePoints(INDEX)
    renderPage('/district/61/changes?to=2026-10-31@2099-01-01')
    expect(lastPair()).toEqual({
      from: { date: '2026-10-31', asOf: '2026-11-02' },
      to: '2026-10-31',
    })
  })

  it('shows the revision label in the picker', () => {
    usePoints(INDEX)
    renderPage()
    expect(screen.getByTestId('changes-from-chip')).toHaveTextContent(
      'Oct 31, 2026 · revised Nov 2'
    )
    expect(screen.getByTestId('changes-to-chip')).toHaveTextContent(
      'Oct 31, 2026 · revised Nov 3'
    )
  })

  it('does not read the month end rankings for a revision point', () => {
    usePoints(INDEX)
    renderPage()
    // from is a revision (rankings per revision are phase 2); to is the plain
    // month end and still reads its rankings.
    expect(mockedRanking).toHaveBeenCalledWith('61', undefined)
    expect(mockedRanking).toHaveBeenCalledWith('61', '2026-10-31')
  })

  it('treats two revisions of one month end as distinct dates, not a same-date pair', () => {
    usePoints(INDEX)
    renderPage('/district/61/changes?from=2026-10-31@2026-11-02')
    expect(screen.queryByTestId('changes-same-date')).toBeNull()
  })

  it('flags a pair that runs backwards across revisions', () => {
    usePoints(INDEX)
    renderPage('/district/61/changes?from=2026-10-31&to=2026-10-31@2026-11-02')
    expect(screen.getByTestId('changes-reversed')).toBeInTheDocument()
  })
})

describe('DistrictChangesPage — outside reconciliation (#2475 regression)', () => {
  it('with no revisions the default pair is [-2] → [-1] and the URL is untouched', () => {
    usePoints(null)
    renderPage()
    expect(lastPair()).toEqual({ from: '2026-10-30', to: '2026-10-31' })
    expect(screen.getByTestId('changes-from-chip-select')).toHaveValue(
      '2026-10-30'
    )
    expect(screen.getByTestId('changes-to-chip-select')).toHaveValue(
      '2026-10-31'
    )
    expect(screen.queryByText(/revised/)).toBeNull()
  })

  it('a plain ?from=&to= deep link still resolves', () => {
    usePoints(null)
    renderPage('/district/61/changes?from=2026-10-29&to=2026-10-30')
    expect(lastPair()).toEqual({ from: '2026-10-29', to: '2026-10-30' })
  })

  it('an @asOf on a district with no revisions falls back to the default', () => {
    usePoints(null)
    renderPage('/district/61/changes?to=2026-10-31@2026-11-02')
    expect(lastPair()).toEqual({ from: '2026-10-30', to: '2026-10-31' })
  })

  it('after rollover the default stays over dated snapshots', () => {
    const dates = [...DATES, snap('2026-11-04'), snap('2026-11-05')]
    mockedDates.mockReturnValue({
      data: { dates },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    mockedPoints.mockReturnValue({
      ...buildSnapshotPoints(dates, INDEX, '61'),
      isLoading: false,
    })
    renderPage()
    expect(lastPair()).toEqual({ from: '2026-11-04', to: '2026-11-05' })
  })
})

/* #2814 — an @asOf link is only understood once the revision index has loaded.
   Until then the page must not fetch (or show) the default pair. */
describe('DistrictChangesPage — @asOf link while the index loads (#2814)', () => {
  function usePointsLoading() {
    mockedPoints.mockReturnValue({
      ...buildSnapshotPoints(DATES, null, '61'),
      isLoading: true,
    })
  }

  it('fetches no diff for an @ link before the index resolves', () => {
    usePointsLoading()
    renderPage('/district/61/changes?to=2026-10-31@2026-11-02')
    for (const call of mockedDiff.mock.calls) {
      expect(call[1]).toBeUndefined()
      expect(call[2]).toBeUndefined()
    }
  })

  it('holds for @ in the from param too, and shows the loading state', () => {
    usePointsLoading()
    renderPage('/district/61/changes?from=2026-10-31@2026-11-02')
    for (const call of mockedDiff.mock.calls) {
      expect(call[1]).toBeUndefined()
      expect(call[2]).toBeUndefined()
    }
    expect(screen.queryByTestId('changes-error')).toBeNull()
  })

  it('a link without @ still fetches the default pair while the index loads', () => {
    usePointsLoading()
    renderPage('/district/61/changes?from=2026-10-29&to=2026-10-30')
    expect(lastPair()).toEqual({ from: '2026-10-29', to: '2026-10-30' })
  })

  it('resolves the @ link once the index has loaded', () => {
    usePoints(INDEX)
    renderPage('/district/61/changes?from=2026-10-30&to=2026-10-31@2026-11-02')
    expect(lastPair().to).toEqual({ date: '2026-10-31', asOf: '2026-11-02' })
  })
})
