/**
 * Charter cohort survival reader (#2061). Fixture: the pipeline fold's D61
 * file over the recorded prod history (2026-10-15).
 *
 * Any failure — a 404 (the file is not on prod yet), a network error, a
 * contract failure, a file for another district — resolves `null`, and the
 * page falls back to folding the history shards itself.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  cdnCharterCohortSurvivalUrl,
  fetchCharterCohortSurvival,
} from '../cdnCharterCohortSurvival'
import d61 from '../../__tests__/fixtures/charter-cohort-survival-d61.json'

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

describe('charter cohort survival reader (#2061)', () => {
  it('targets config/charter-cohort-survival/district_<id>.json', () => {
    expect(cdnCharterCohortSurvivalUrl('61')).toMatch(
      /\/config\/charter-cohort-survival\/district_61\.json$/
    )
  })

  it('resolves the validated file', async () => {
    const fn = stubFetch({ ok: true, status: 200, body: d61 })
    const file = await fetchCharterCohortSurvival('61')
    expect(fn).toHaveBeenCalledWith(cdnCharterCohortSurvivalUrl('61'))
    expect(file?.districtId).toBe('61')
    expect(file?.programYears).toContain('2026-2027')
  })

  it('resolves null on a 404 (not on prod yet)', async () => {
    stubFetch({ ok: false, status: 404 })
    expect(await fetchCharterCohortSurvival('61')).toBeNull()
  })

  it('resolves null on a contract failure', async () => {
    stubFetch({ ok: true, status: 200, body: { ...d61, asOf: 'soon' } })
    expect(await fetchCharterCohortSurvival('61')).toBeNull()
  })

  it('resolves null for a file that names another district', async () => {
    stubFetch({ ok: true, status: 200, body: d61 })
    expect(await fetchCharterCohortSurvival('01')).toBeNull()
  })

  it('resolves null on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await fetchCharterCohortSurvival('61')).toBeNull()
  })

  it('never builds a URL from an unsafe district id', async () => {
    const fn = stubFetch({ ok: true, status: 200, body: d61 })
    expect(await fetchCharterCohortSurvival('../61')).toBeNull()
    expect(fn).not.toHaveBeenCalled()
  })
})
