import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchCdnRankings,
  fetchCdnRankingsForDate,
  fetchCdnRankingsForDateExact,
  type CdnRankingsData,
} from '../cdn'
import { snap } from '../../test-utils/snapshotDate'

/* #1475 — a CHECKPOINT read must never be answered by another date's file.
   `fetchCdnRankingsForDate` silently falls back to `v1/rankings.json` when the
   per-date file 404s, which is right for a "show me something" page and fatal
   for a Sep 30 / Mar 31 verdict: today's cumulative charter count would be
   served under a September label and award a milestone that was never earned.
   `fetchCdnRankingsForDateExact` is the non-falling-back variant — a missing
   file is `null`, i.e. "not available", never a substitution.

   Fixtures diverge `sourceCsvDate` from the pinned date deliberately: the LIVE
   checkpoint files do (verified 2026-08-31 — `snapshots/2025-09-30/` carries
   sourceCsvDate 2025-10-10, `snapshots/2026-03-31/` carries 2026-04-07). */

const okResponse = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
  }) as unknown as Response

const notFound = (): Response =>
  ({ ok: false, status: 404 }) as unknown as Response

/** One rankings row, typed by the wire contract the frontend declares. */
function row(
  districtId: string,
  newCharteredClubs: number
): CdnRankingsData['rankings'][number] {
  return {
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
    newCharteredClubs,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('CdnRankingsData rows carry newCharteredClubs (#1475)', () => {
  it('round-trips the field the wire has always published', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse({
        metadata: { sourceCsvDate: '2026-10-05' },
        rankings: [row('61', 5)],
      })
    )

    const data = await fetchCdnRankingsForDateExact(snap('2026-09-30'))

    expect(data?.rankings[0]?.newCharteredClubs).toBe(5)
  })

  it('leaves the field undefined for a pre-#336 file that omits it', async () => {
    const { newCharteredClubs: _omitted, ...legacyRow } = row('61', 5)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse({
        metadata: { sourceCsvDate: '2024-10-05' },
        rankings: [legacyRow],
      })
    )

    const data = await fetchCdnRankingsForDateExact(snap('2024-09-30'))

    expect(data?.rankings[0]?.newCharteredClubs).toBeUndefined()
  })
})

describe('fetchCdnRankingsForDateExact — no silent latest-date fallback (#1475)', () => {
  it('returns null when the per-date file 404s, without fetching v1/rankings.json', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(notFound())

    const data = await fetchCdnRankingsForDateExact(snap('2026-09-30'))

    expect(data).toBeNull()
    // Exactly one request — the checkpoint's own file. A second request here
    // would be the latest-rankings fallback, i.e. the bug.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain(
      '/snapshots/2026-09-30/all-districts-rankings.json'
    )
  })

  it('keeps the pinned date and the as-of date apart', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse({
        metadata: {
          sourceCsvDate: '2026-10-05',
          calculatedAt: '2026-10-05T00:00:00Z',
        },
        rankings: [row('61', 5)],
      })
    )

    const data = await fetchCdnRankingsForDateExact(snap('2026-09-30'))

    expect(data?.snapshotDate).toBe('2026-09-30')
    expect(data?.asOfDate).toBe('2026-10-05')
  })
})

describe('fetchCdnRankingsForDate — the falling-back variant is unchanged', () => {
  it('still substitutes the latest file on a 404 (why the exact variant exists)', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(
        okResponse({
          rankings: [row('61', 12)],
          date: '2026-08-30',
          generatedAt: 'x',
        })
      )

    const data = await fetchCdnRankingsForDate(snap('2026-09-30'))

    // 12 is TODAY's cumulative count. Served under a September 30 request, it
    // is exactly the unearned-milestone hazard — hence the exact variant.
    expect(data.rankings[0]?.newCharteredClubs).toBe(12)
    expect(data.snapshotDate).toBeUndefined()
  })

  it('is a thin fallback wrapper over the exact fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse({
        metadata: { sourceCsvDate: '2026-10-05' },
        rankings: [row('61', 5)],
      })
    )

    const [exact, falling] = await Promise.all([
      fetchCdnRankingsForDateExact(snap('2026-09-30')),
      fetchCdnRankingsForDate(snap('2026-09-30')),
    ])

    expect(falling).toEqual(exact)
  })
})

describe('fetchCdnRankings — the latest path still parses rows', () => {
  it('exposes newCharteredClubs on the latest file too', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse({
        rankings: [row('61', 12)],
        date: '2026-08-30',
        generatedAt: 'x',
      })
    )

    const data = await fetchCdnRankings()

    expect(data.rankings[0]?.newCharteredClubs).toBe(12)
  })
})
