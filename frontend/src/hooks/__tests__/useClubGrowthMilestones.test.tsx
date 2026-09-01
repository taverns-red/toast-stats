/**
 * useClubGrowthMilestones (#1475, epic #1473) — the checkpoint count for the
 * District Club Growth Achievement must come from the CHECKPOINT'S OWN
 * snapshot, and a missing checkpoint file must say "not available".
 *
 * The hazard these tests exist for: `fetchCdnRankingsForDate` silently falls
 * back to `v1/rankings.json` when a per-date file 404s. Used for a Sep 30 /
 * Mar 31 verdict it would report TODAY's cumulative charter count under a
 * September label and award a milestone that was never earned — a plausible
 * wrong number, the failure shape that has cost this repo weeks (#1469).
 *
 * It is not a theoretical substitution either. A district's `newCharteredClubs`
 * legitimately DECREASES mid-program-year (9 occurrences in PY 2025-26) because
 * clubs chartered this year move between districts and the count follows them —
 * the global sum is strictly monotonic (81 → 638), so nothing is lost, it
 * relocates. Today's number is therefore not even a safe upper bound for a past
 * date, and a district that moved a club away in April must keep its September
 * achievement.
 *
 * Every mock here ROUTES ON THE DATE the wire asks for: a date-blind mock
 * serves the right fixture for the wrong key and rubber-stamps exactly this
 * bug class (lesson: divergence-by-default fixtures are inert unless the mock
 * routes on the same key the wire does).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useClubGrowthMilestones } from '../useClubGrowthMilestones'
import {
  fetchCdnRankings,
  fetchCdnRankingsForDate,
  fetchCdnRankingsForDateExact,
  fetchCdnSnapshotIndex,
  type CdnRankingsData,
} from '../../services/cdn'
import { getProgramYear } from '../../utils/programYear'
import { snap } from '../../test-utils/snapshotDate'
import type { SnapshotDate } from '../../types/snapshotDate'

vi.mock('../../services/cdn', () => ({
  fetchCdnSnapshotIndex: vi.fn(),
  fetchCdnRankingsForDateExact: vi.fn(),
  fetchCdnRankingsForDate: vi.fn(),
  fetchCdnRankings: vi.fn(),
}))

const mockedIndex = vi.mocked(fetchCdnSnapshotIndex)
const mockedExact = vi.mocked(fetchCdnRankingsForDateExact)
const mockedFalling = vi.mocked(fetchCdnRankingsForDate)
const mockedLatest = vi.mocked(fetchCdnRankings)

const PY_2026 = getProgramYear(2026)

type Row = CdnRankingsData['rankings'][number]

function row(districtId: string, newCharteredClubs?: number): Row {
  const base: Row = {
    districtId,
    districtName: `District ${districtId}`,
    region: '07',
    paidClubs: 100,
    paidClubBase: 98,
    clubGrowthPercent: 2,
    totalPayments: 3000,
    paymentBase: 2900,
    paymentGrowthPercent: 3,
    activeClubs: 100,
    distinguishedClubs: 30,
    selectDistinguished: 8,
    presidentsDistinguished: 4,
    distinguishedPercent: 30,
    clubsRank: 10,
    paymentsRank: 12,
    distinguishedRank: 14,
    aggregateScore: 400,
    overallRank: 11,
  }
  return newCharteredClubs === undefined ? base : { ...base, newCharteredClubs }
}

/**
 * A dated rankings file. `asOfDate` diverges from the pinned date by design —
 * live checkpoint files do exactly this (`snapshots/2025-09-30/` carries
 * sourceCsvDate 2025-10-10).
 */
function file(date: string, rows: Row[]): CdnRankingsData {
  const asOf = new Date(`${date}T00:00:00Z`)
  asOf.setUTCDate(asOf.getUTCDate() + 10)
  return {
    rankings: rows,
    snapshotDate: snap(date),
    asOfDate: asOf.toISOString().slice(0, 10),
    generatedAt: `${date}T12:00:00Z`,
  }
}

/** What `v1/rankings.json` serves TODAY — never an acceptable checkpoint answer. */
const LATEST: CdnRankingsData = {
  rankings: [row('61', 12)],
  asOfDate: '2027-05-30',
  generatedAt: '2027-05-30T00:00:00Z',
}

/** Availability set (the union of dates in the district snapshot index). */
function indexWith(dates: string[]): Record<string, string[]> {
  return { '61': dates, '42': dates.slice(0, 1) }
}

/** The dates the archive holds around both PY 2026-27 checkpoints. */
const FULL_DATES = [
  '2026-07-31',
  '2026-08-31',
  '2026-09-28', // no 09-30 run — the nearest-prior fallback must fire
  '2026-10-05',
  '2027-03-31',
  '2027-04-30',
]

/** Per-date rankings files, routed on the date the wire asks for. */
const FILES: Record<string, CdnRankingsData> = {
  '2026-09-28': file('2026-09-28', [row('61', 5), row('42', 1)]),
  '2027-03-31': file('2027-03-31', [row('61', 11), row('42', 2)]),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedIndex.mockResolvedValue(indexWith(FULL_DATES))
  mockedExact.mockImplementation(async (date: SnapshotDate) =>
    Object.prototype.hasOwnProperty.call(FILES, date)
      ? (FILES[date] as CdnRankingsData)
      : null
  )
  mockedFalling.mockResolvedValue(LATEST)
  mockedLatest.mockResolvedValue(LATEST)
})
afterEach(() => cleanup())

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderMilestones(
  client: QueryClient = makeClient(),
  districtId: string | undefined = '61'
) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return {
    client,
    ...renderHook(() => useClubGrowthMilestones(districtId, PY_2026), {
      wrapper,
    }),
  }
}

const septemberOf = (
  result: ReturnType<typeof useClubGrowthMilestones>
): (typeof result.checkpoints)[number] =>
  result.checkpoints.find(c => c.id === 'september')!

const marchOf = (
  result: ReturnType<typeof useClubGrowthMilestones>
): (typeof result.checkpoints)[number] =>
  result.checkpoints.find(c => c.id === 'march')!

describe('useClubGrowthMilestones — the checkpoint read (#1475)', () => {
  it('reads each checkpoint from the nearest-prior snapshot and surfaces its provenance', async () => {
    const { result } = renderMilestones()

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const sep = septemberOf(result.current)
    expect(sep.checkpointDate).toBe('2026-09-30')
    expect(sep.status).toBe('resolved')
    expect(sep.newCharteredClubs).toBe(5)
    // No 2026-09-30 run exists, so the answer comes from 2026-09-28 and SAYS so.
    expect(sep.resolvedFromDate).toBe('2026-09-28')
    expect(sep.isFallbackDate).toBe(true)
    // The as-of date diverges from the pinned date; it is provenance only.
    expect(sep.asOfDate).toBe('2026-10-08')

    const mar = marchOf(result.current)
    expect(mar.checkpointDate).toBe('2027-03-31')
    expect(mar.status).toBe('resolved')
    // Cumulative from July 1 — March includes what September already counted.
    expect(mar.newCharteredClubs).toBe(11)
    expect(mar.resolvedFromDate).toBe('2027-03-31')
    expect(mar.isFallbackDate).toBe(false)

    expect(mockedExact).toHaveBeenCalledWith('2026-09-28')
    expect(mockedExact).toHaveBeenCalledWith('2027-03-31')
  })

  it('never substitutes the latest rankings for a missing checkpoint file', async () => {
    // The settled September checkpoint's file is gone. `fetchCdnRankingsForDate`
    // would answer with v1/rankings.json (district 61 = 12 charters today) and
    // hand a Sep-30 label to a May number. The hook must say "not available".
    mockedExact.mockImplementation(async (date: SnapshotDate) =>
      date === '2027-03-31' ? (FILES['2027-03-31'] as CdnRankingsData) : null
    )

    const { result } = renderMilestones()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const sep = septemberOf(result.current)
    expect(sep.status).toBe('unavailable')
    expect(sep.unavailableReason).toBe('snapshot-missing')
    expect(sep.newCharteredClubs).toBeNull()
    // The falling-back fetchers are the hazard — they must be untouched.
    expect(mockedFalling).not.toHaveBeenCalled()
    expect(mockedLatest).not.toHaveBeenCalled()
    // And 12 (today's count) must appear nowhere in the resolved state.
    expect(
      result.current.checkpoints.map(c => c.newCharteredClubs)
    ).not.toContain(12)
    // The other checkpoint is unaffected — one missing file is not an outage.
    expect(marchOf(result.current).newCharteredClubs).toBe(11)
  })

  it('reports a district absent from that date’s rows as unavailable, not 0', async () => {
    // District 61 did not exist on 2026-09-28 (realignment). Zero would read as
    // "chartered nothing", which is a different claim from "we cannot say".
    mockedExact.mockImplementation(async (date: SnapshotDate) =>
      date === '2026-09-28'
        ? file('2026-09-28', [row('42', 1)])
        : (FILES[date] ?? null)
    )

    const { result } = renderMilestones()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const sep = septemberOf(result.current)
    expect(sep.status).toBe('unavailable')
    expect(sep.unavailableReason).toBe('district-absent')
    expect(sep.newCharteredClubs).toBeNull()
  })

  it('reports a pre-#336 file that omits the field as unavailable, not 0', async () => {
    mockedExact.mockImplementation(async (date: SnapshotDate) =>
      date === '2026-09-28'
        ? file('2026-09-28', [row('61')])
        : (FILES[date] ?? null)
    )

    const { result } = renderMilestones()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const sep = septemberOf(result.current)
    expect(sep.status).toBe('unavailable')
    expect(sep.unavailableReason).toBe('count-absent')
    expect(sep.newCharteredClubs).toBeNull()
  })
})

describe('useClubGrowthMilestones — settledness (#1475)', () => {
  it('leaves a checkpoint the archive has not reached pending, and fetches nothing for it', async () => {
    // The pipeline's newest run is 2026-09-14, so nothing proves what the
    // September 30 count will be. Reading the 09-14 file and calling it the
    // checkpoint would be the same lie one date earlier.
    mockedIndex.mockResolvedValue(
      indexWith(['2026-07-31', '2026-08-31', '2026-09-14'])
    )

    const { result } = renderMilestones()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(septemberOf(result.current).status).toBe('pending')
    expect(septemberOf(result.current).newCharteredClubs).toBeNull()
    expect(septemberOf(result.current).resolvedFromDate).toBeNull()
    expect(marchOf(result.current).status).toBe('pending')
    expect(mockedExact).not.toHaveBeenCalled()
    expect(mockedFalling).not.toHaveBeenCalled()
    expect(mockedLatest).not.toHaveBeenCalled()
  })

  it('settles a checkpoint as soon as any later date exists, even without an exact run', async () => {
    mockedIndex.mockResolvedValue(indexWith(['2026-09-28', '2026-10-05']))

    const { result } = renderMilestones()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(septemberOf(result.current).status).toBe('resolved')
    expect(septemberOf(result.current).resolvedFromDate).toBe('2026-09-28')
    // March 2027 is still beyond the archive.
    expect(marchOf(result.current).status).toBe('pending')
  })

  it('reports a settled checkpoint with no at-or-before snapshot as unavailable', async () => {
    // The archive starts after the checkpoint — settled, but nothing to read.
    mockedIndex.mockResolvedValue(indexWith(['2026-10-05', '2027-03-31']))

    const { result } = renderMilestones()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const sep = septemberOf(result.current)
    expect(sep.status).toBe('unavailable')
    expect(sep.unavailableReason).toBe('snapshot-missing')
    expect(mockedExact).not.toHaveBeenCalledWith('2026-10-05')
  })
})

describe('useClubGrowthMilestones — query keys and the unscoped-first window (#1475)', () => {
  it('keys each checkpoint fetch on the PINNED snapshot date, never the as-of date', async () => {
    const { result, client } = renderMilestones()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(
      client.getQueryData(['rankings-checkpoint', '2026-09-28'])
    ).toBeDefined()
    expect(
      client.getQueryData(['rankings-checkpoint', '2027-03-31'])
    ).toBeDefined()
    // 2026-10-08 is the September file's as-of date. Keying on it is the #1315
    // class — a key that 404s live while every fixture-equal test passes.
    expect(
      client.getQueryData(['rankings-checkpoint', '2026-10-08'])
    ).toBeUndefined()
  })

  it('says nothing until the availability set has resolved', async () => {
    // The availability set arrives from a 388KB fetch; the rankings files are
    // far smaller. Any state published before it lands is an answer derived
    // from an empty archive — "pending" would be a claim, not a placeholder.
    mockedIndex.mockReturnValue(new Promise(() => {}))

    const { result } = renderMilestones()

    await waitFor(() => expect(mockedIndex).toHaveBeenCalled())
    expect(result.current.isLoading).toBe(true)
    expect(septemberOf(result.current).status).toBe('loading')
    expect(marchOf(result.current).status).toBe('loading')
    expect(mockedExact).not.toHaveBeenCalled()
  })

  it('stays quiet with no district id and issues no fetch', async () => {
    const { result } = renderMilestones(makeClient(), undefined)

    expect(result.current.isLoading).toBe(true)
    expect(septemberOf(result.current).status).toBe('loading')
    expect(mockedExact).not.toHaveBeenCalled()
  })

  it('scopes the answer to the program year the parent passed (R3)', async () => {
    // PY 2025-26's checkpoints are different dates and different files. The
    // hook must never derive the year from a response's own dates.
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={makeClient()}>
        {children}
      </QueryClientProvider>
    )
    mockedIndex.mockResolvedValue(
      indexWith(['2025-09-30', '2026-03-31', ...FULL_DATES])
    )
    mockedExact.mockImplementation(async (date: SnapshotDate) =>
      date === '2025-09-30'
        ? file('2025-09-30', [row('61', 3)])
        : (FILES[date] ?? null)
    )

    const { result } = renderHook(
      () => useClubGrowthMilestones('61', getProgramYear(2025)),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const sep = septemberOf(result.current)
    expect(sep.checkpointDate).toBe('2025-09-30')
    expect(sep.newCharteredClubs).toBe(3)
    expect(mockedExact).toHaveBeenCalledWith('2025-09-30')
    expect(mockedExact).not.toHaveBeenCalledWith('2026-09-28')
  })
})

/**
 * The phantom-zero guard (#1501).
 *
 * `newCharteredClubs` is present and **zero** on every row of all five
 * program-year-end rankings files in the live archive, while a normal
 * month-end carries real values:
 *
 *   2022-06-30 rows=125 present=125 sum=0
 *   2023-06-30 rows=128 present=128 sum=0
 *   2024-06-30 rows=130 present=130 sum=0
 *   2025-06-30 rows=132 present=132 sum=0
 *   2026-06-30 rows=128 present=128 sum=0
 *   2026-05-31 rows=128 present=128 sum=638   ← normal
 *
 * Those files were rebuilt WITHOUT raw CSVs (R2 — runners start empty), so
 * `TransformService` had no `district-performance.csv` to derive the count
 * from and it defaulted to 0 instead of being omitted. A phantom zero IS a
 * number, so the `count-absent` guard above waves it through and the card
 * renders a confident "no milestone reached" for every district — including
 * the five already sitting at 3 charters.
 *
 * Sibling of the hazard #1475 closed: that one was SUBSTITUTION (a missing
 * checkpoint must never render as today's numbers); this one is a
 * present-but-unpopulated field rendering as an earned-nothing verdict.
 */
describe('useClubGrowthMilestones — the phantom-zero guard (#1501)', () => {
  /** A district-census-sized file where every row carries a zero count. */
  const zeroedCensus = (date: string, size = 128): CdnRankingsData =>
    file(
      date,
      Array.from({ length: size }, (_, i) => row(String(i + 1), 0))
    )

  it('reports a district-wide all-zero charter count as not collected, not as zero charters', async () => {
    // The exact shape of the five rebuilt year-end files: field present on
    // every row, global sum 0. A true global zero across ~94-132 districts
    // does not occur — the lowest observed month-end total is 81.
    mockedExact.mockImplementation(async (date: SnapshotDate) =>
      date === '2026-09-28' ? zeroedCensus('2026-09-28') : (FILES[date] ?? null)
    )

    const { result } = renderMilestones()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const sep = septemberOf(result.current)
    expect(sep.status).toBe('unavailable')
    // Distinct from `count-absent` (the field is present) and from
    // `snapshot-missing` (the file is there) — three separable causes.
    expect(sep.unavailableReason).toBe('count-not-collected')
    expect(sep.newCharteredClubs).toBeNull()
    // Provenance survives: the reader is told which file could not answer.
    expect(sep.resolvedFromDate).toBe('2026-09-28')
    // The unaffected checkpoint still resolves — one bad file is not an outage.
    expect(marchOf(result.current).newCharteredClubs).toBe(11)
  })

  it('still reports a genuine single-district zero as a real zero', async () => {
    // District 61 chartered nothing by September 30 while the rest of the
    // world did. That is a fact about district 61, not a collection gap, and
    // suppressing it would be the mirror-image lie.
    mockedExact.mockImplementation(async (date: SnapshotDate) =>
      date === '2026-09-28'
        ? file('2026-09-28', [
            row('61', 0),
            ...Array.from({ length: 127 }, (_, i) => row(String(i + 100), 5)),
          ])
        : (FILES[date] ?? null)
    )

    const { result } = renderMilestones()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const sep = septemberOf(result.current)
    expect(sep.status).toBe('resolved')
    expect(sep.newCharteredClubs).toBe(0)
    expect(sep.unavailableReason).toBeNull()
  })

  it('does not read a global zero out of a file too small to be a district census', async () => {
    // Two rows is not evidence about ~94-132 districts. A truncated file is a
    // different pathology (#1469) and must not be laundered into a charter
    // verdict either way — the count is reported as the file gives it.
    mockedExact.mockImplementation(async (date: SnapshotDate) =>
      date === '2026-09-28'
        ? file('2026-09-28', [row('61', 0), row('42', 0)])
        : (FILES[date] ?? null)
    )

    const { result } = renderMilestones()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const sep = septemberOf(result.current)
    expect(sep.status).toBe('resolved')
    expect(sep.newCharteredClubs).toBe(0)
  })
})
