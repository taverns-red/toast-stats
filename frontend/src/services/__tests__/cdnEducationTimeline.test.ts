/**
 * Education timeline reader (#2592, artifact from #2591): one file per
 * entity per program year, `derived/education-timeline/<PY>/<file>`.
 *
 * A missing file is "not available yet" (the backfill has not run, or the
 * set's promotion refused), so it resolves `null` -- never a zero line and
 * never a thrown error. The same goes for an off-contract body.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { DISTRICT_61_TIMELINE as EDUCATION_TIMELINE_ENTITY } from '../../__tests__/fixtures/educationTimelineFixtures'
import { cdnEducationTimelineUrl, fetchCdnEducationTimeline } from '../cdn'

function stubFetch(res: { ok: boolean; status: number; body?: unknown }) {
  const fn = vi.fn().mockResolvedValue({
    ok: res.ok,
    status: res.status,
    headers: new Headers(),
    json: async () => res.body,
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('education timeline URLs', () => {
  it('name the entity file inside the program year prefix', () => {
    expect(cdnEducationTimelineUrl('2026-2027', 'world', null)).toMatch(
      /\/derived\/education-timeline\/2026-2027\/world\.json$/
    )
    expect(cdnEducationTimelineUrl('2026-2027', 'region', '09')).toMatch(
      /\/derived\/education-timeline\/2026-2027\/region-09\.json$/
    )
    expect(cdnEducationTimelineUrl('2026-2027', 'district', '61')).toMatch(
      /\/derived\/education-timeline\/2026-2027\/district-61\.json$/
    )
  })

  it('refuse a program year or id that is not one', () => {
    expect(() => cdnEducationTimelineUrl('../v1', 'world', null)).toThrow()
    expect(() =>
      cdnEducationTimelineUrl('2026-2027', 'district', '../x')
    ).toThrow()
  })
})

describe('fetchCdnEducationTimeline', () => {
  it('returns the validated file on a 200', async () => {
    const fetchFn = stubFetch({
      ok: true,
      status: 200,
      body: EDUCATION_TIMELINE_ENTITY,
    })
    const file = await fetchCdnEducationTimeline('2026-2027', 'district', '61')
    expect(fetchFn).toHaveBeenCalledWith(
      cdnEducationTimelineUrl('2026-2027', 'district', '61')
    )
    expect(file?.asOf).toBe('2026-10-11')
    expect(file?.points).toHaveLength(8)
  })

  it('drops a field a newer pipeline added', async () => {
    stubFetch({
      ok: true,
      status: 200,
      body: { ...EDUCATION_TIMELINE_ENTITY, addedLater: 1 },
    })
    const file = await fetchCdnEducationTimeline('2026-2027', 'district', '61')
    expect(file).not.toBeNull()
    expect(file).not.toHaveProperty('addedLater')
  })

  it('resolves null on a 404 (not available yet)', async () => {
    stubFetch({ ok: false, status: 404 })
    await expect(
      fetchCdnEducationTimeline('2026-2027', 'district', '61')
    ).resolves.toBe(null)
  })

  it('resolves null for a body that fails its contract', async () => {
    stubFetch({
      ok: true,
      status: 200,
      body: { ...EDUCATION_TIMELINE_ENTITY, points: [] },
    })
    await expect(
      fetchCdnEducationTimeline('2026-2027', 'district', '61')
    ).resolves.toBe(null)
  })

  it('resolves null on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(
      fetchCdnEducationTimeline('2026-2027', 'district', '61')
    ).resolves.toBe(null)
  })
})
