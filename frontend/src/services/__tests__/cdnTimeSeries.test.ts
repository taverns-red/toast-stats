/**
 * cdnTimeSeries — behavioural tests for the real module (#1687).
 *
 * `useTimeSeries.test` mocks this whole module, so the program-year logic and
 * the URL builders never ran under test. These tests exercise them directly:
 * the calendar program-year boundary (June 30 → July 1), the prior-year list,
 * and the CDN fetch contract (URL shape, error on non-OK).
 *
 * `getCurrentProgramYear` is deliberately calendar-pure (CLAUDE.md #1284
 * tripwire; Lesson "derive the PY from the logical date"): callers that know
 * the data's PY pass it in as `selectedProgramYear`; this helper is only the
 * calendar fallback. The clock is pinned with LOCAL-time `new Date(y, m, d)`
 * constructors so the boundary assertions hold in any test-runner time zone.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  cdnTimeSeriesMetadataUrl,
  cdnTimeSeriesProgramYearUrl,
  fetchTimeSeriesMetadata,
  fetchTimeSeriesProgramYear,
  getCurrentProgramYear,
  getPreviousProgramYears,
} from '../cdnTimeSeries'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function pinClock(local: Date): void {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(local)
}

describe('getCurrentProgramYear — calendar program year (July 1 → June 30)', () => {
  it('June 30, 23:59:59 local is still the prior program year', () => {
    pinClock(new Date(2026, 5, 30, 23, 59, 59))
    expect(getCurrentProgramYear()).toBe('2025-2026')
  })

  it('July 1, 00:00:00 local rolls over to the new program year', () => {
    pinClock(new Date(2026, 6, 1, 0, 0, 0))
    expect(getCurrentProgramYear()).toBe('2026-2027')
  })

  it('a June close collected in late July resolves to the NEW calendar PY (callers must pass the logical PY)', () => {
    // The June 2026 close is collected ~2026-07-25. The calendar fallback
    // says 2026-2027 — which is why useTimeSeries prefers the parent's
    // selectedProgramYear over this helper (R3 / #1184).
    pinClock(new Date(2026, 6, 25, 12, 0, 0))
    expect(getCurrentProgramYear()).toBe('2026-2027')
  })

  it('January 1 belongs to the program year that started the previous July', () => {
    pinClock(new Date(2027, 0, 1, 0, 0, 0))
    expect(getCurrentProgramYear()).toBe('2026-2027')
  })

  it('December 31 belongs to the program year that started that July', () => {
    pinClock(new Date(2026, 11, 31, 23, 59, 59))
    expect(getCurrentProgramYear()).toBe('2026-2027')
  })

  it('mid-year (March) resolves to the PY that started the prior July', () => {
    pinClock(new Date(2026, 2, 15))
    expect(getCurrentProgramYear()).toBe('2025-2026')
  })

  it('always returns a YYYY-YYYY label whose years are consecutive', () => {
    for (let month = 0; month < 12; month++) {
      pinClock(new Date(2030, month, 15))
      const [start, end] = getCurrentProgramYear().split('-').map(Number)
      expect(end! - start!).toBe(1)
      expect(start).toBe(month >= 6 ? 2030 : 2029)
    }
  })
})

describe('getPreviousProgramYears', () => {
  it('lists the N preceding program years, most recent first, excluding the current', () => {
    expect(getPreviousProgramYears('2025-2026', 2)).toEqual([
      '2024-2025',
      '2023-2024',
    ])
  })

  it('returns an empty list for a count of 0', () => {
    expect(getPreviousProgramYears('2025-2026', 0)).toEqual([])
  })

  it('returns an empty list for a negative count', () => {
    expect(getPreviousProgramYears('2025-2026', -3)).toEqual([])
  })

  it('crosses decade/century boundaries with plain integer arithmetic', () => {
    expect(getPreviousProgramYears('2000-2001', 2)).toEqual([
      '1999-2000',
      '1998-1999',
    ])
  })

  it('chains with getCurrentProgramYear at the July rollover', () => {
    pinClock(new Date(2026, 6, 1))
    expect(getPreviousProgramYears(getCurrentProgramYear(), 2)).toEqual([
      '2025-2026',
      '2024-2025',
    ])
    pinClock(new Date(2026, 5, 30))
    expect(getPreviousProgramYears(getCurrentProgramYear(), 2)).toEqual([
      '2024-2025',
      '2023-2024',
    ])
  })

  it('derives priors from the start year only (the end year is ignored)', () => {
    expect(getPreviousProgramYears('2025-2026', 1)).toEqual(
      getPreviousProgramYears('2025-9999', 1)
    )
  })
})

describe('CDN URL builders', () => {
  it('builds the metadata URL under time-series/district_{id}/', () => {
    const url = cdnTimeSeriesMetadataUrl('61')
    expect(url).toMatch(
      /^https?:\/\/[^/]+\/time-series\/district_61\/index-metadata\.json$/
    )
  })

  it('builds the program-year URL as {programYear}.json', () => {
    const url = cdnTimeSeriesProgramYearUrl('F', '2025-2026')
    expect(url).toMatch(
      /^https?:\/\/[^/]+\/time-series\/district_F\/2025-2026\.json$/
    )
  })

  it('metadata and program-year URLs share one base', () => {
    const meta = cdnTimeSeriesMetadataUrl('42')
    const py = cdnTimeSeriesProgramYearUrl('42', '2024-2025')
    expect(meta.replace('index-metadata.json', '')).toBe(
      py.replace('2024-2025.json', '')
    )
  })
})

describe('fetchTimeSeriesMetadata / fetchTimeSeriesProgramYear', () => {
  function stubFetch(response: {
    ok: boolean
    status: number
    body?: unknown
  }) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: response.ok,
      status: response.status,
      headers: new Headers(),
      json: async () => response.body,
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('fetches the metadata URL and returns the parsed body', async () => {
    const body = {
      districtId: '61',
      availableProgramYears: ['2024-2025', '2025-2026'],
      totalDataPoints: 120,
    }
    const fetchMock = stubFetch({ ok: true, status: 200, body })

    await expect(fetchTimeSeriesMetadata('61')).resolves.toEqual(body)
    expect(fetchMock).toHaveBeenCalledWith(cdnTimeSeriesMetadataUrl('61'))
  })

  it('fetches the program-year URL and returns the parsed body', async () => {
    const body = { programYear: '2025-2026', dataPoints: [] }
    const fetchMock = stubFetch({ ok: true, status: 200, body })

    await expect(
      fetchTimeSeriesProgramYear('61', '2025-2026')
    ).resolves.toEqual(body)
    expect(fetchMock).toHaveBeenCalledWith(
      cdnTimeSeriesProgramYearUrl('61', '2025-2026')
    )
  })

  it('rejects with the status and URL when the CDN returns non-OK', async () => {
    stubFetch({ ok: false, status: 404 })

    await expect(fetchTimeSeriesProgramYear('61', '2026-2027')).rejects.toThrow(
      /404.*district_61\/2026-2027\.json/
    )
  })

  it('rejects when metadata is missing (non-OK)', async () => {
    stubFetch({ ok: false, status: 403 })

    await expect(fetchTimeSeriesMetadata('99')).rejects.toThrow(/403/)
  })
})
