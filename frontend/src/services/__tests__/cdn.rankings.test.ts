import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCdnRankings, fetchCdnRankingsForDate } from '../cdn'

/* Sprint 1 of epic #1319 (snapshot-date guard).
   `CdnRankingsData` must carry an unambiguous `asOfDate` (the advancing
   dashboard as-of / sourceCsvDate) and an optional `snapshotDate` (the pinned
   snapshot the file lives under) — and NO bare `date` field. The old `date`
   conflated the two, which is the root of the #1315 closing-window blank-UI
   class. Fixtures here deliberately DIVERGE the two dates (sourceCsvDate is 5
   days past the snapshot) so a test can't pass by accident when they're equal. */

const okResponse = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
  }) as unknown as Response

const notFound = (): Response =>
  ({ ok: false, status: 404 }) as unknown as Response

afterEach(() => vi.restoreAllMocks())

describe('fetchCdnRankingsForDate — asOfDate vs snapshotDate (#1320)', () => {
  it('returns snapshotDate = its date arg and asOfDate = sourceCsvDate, with no `date`', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse({
        metadata: {
          sourceCsvDate: '2026-07-05', // as-of, advanced past the pinned close
          calculatedAt: '2026-07-05T00:00:00Z',
        },
        rankings: [],
      })
    )

    const data = await fetchCdnRankingsForDate('2026-06-30')

    expect(data.snapshotDate).toBe('2026-06-30')
    expect(data.asOfDate).toBe('2026-07-05')
    // @ts-expect-error — the ambiguous `date` field must not exist anymore
    expect(data.date).toBeUndefined()
  })

  it('falls back to the latest file (snapshotDate undefined) when the per-date file 404s', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(notFound()) // per-date snapshot missing
      .mockResolvedValueOnce(
        okResponse({ rankings: [], date: '2026-07-05', generatedAt: 'x' })
      )

    const data = await fetchCdnRankingsForDate('2026-06-30')

    expect(data.asOfDate).toBe('2026-07-05')
    expect(data.snapshotDate).toBeUndefined()
  })
})

describe('fetchCdnRankings — latest path (#1320)', () => {
  it('maps the raw `date` field to `asOfDate`, snapshotDate undefined', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse({ rankings: [], date: '2026-07-05', generatedAt: 'x' })
    )

    const data = await fetchCdnRankings()

    expect(data.asOfDate).toBe('2026-07-05')
    expect(data.snapshotDate).toBeUndefined()
    // @ts-expect-error — no bare `date` on the returned shape
    expect(data.date).toBeUndefined()
  })
})
