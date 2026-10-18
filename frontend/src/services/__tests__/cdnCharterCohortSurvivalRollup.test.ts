/**
 * Region and world charter cohort survival reader (#1818). Fixtures: the
 * pipeline fold's Region 09 and world files over the recorded prod
 * histories.
 *
 * A 404 (the file is not on prod yet), a contract failure or a file for
 * another scope resolves `null`: the page says the survival is not
 * available yet. A network or server error rejects, so the page can say
 * it could not load and offer nothing misleading.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  cdnCharterCohortSurvivalRollupUrl,
  fetchCharterCohortSurvivalRollup,
} from '../cdnCharterCohortSurvivalRollup'
import r09 from '../../__tests__/fixtures/charter-cohort-survival-region-09.json'
import world from '../../__tests__/fixtures/charter-cohort-survival-world.json'

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

const REGION_09 = { kind: 'region', regionId: '09' } as const
const WORLD = { kind: 'world' } as const

describe('region and world survival reader (#1818)', () => {
  it('targets config/charter-cohort-survival/{region_<NN>,world}.json', () => {
    expect(cdnCharterCohortSurvivalRollupUrl(REGION_09)).toMatch(
      /\/config\/charter-cohort-survival\/region_09\.json$/
    )
    expect(cdnCharterCohortSurvivalRollupUrl(WORLD)).toMatch(
      /\/config\/charter-cohort-survival\/world\.json$/
    )
  })

  it('resolves the validated file', async () => {
    const fn = stubFetch({ ok: true, status: 200, body: r09 })
    const file = await fetchCharterCohortSurvivalRollup(REGION_09)
    expect(fn).toHaveBeenCalledWith(
      cdnCharterCohortSurvivalRollupUrl(REGION_09)
    )
    expect(file?.scope).toEqual(REGION_09)
    stubFetch({ ok: true, status: 200, body: world })
    expect((await fetchCharterCohortSurvivalRollup(WORLD))?.scope).toEqual(
      WORLD
    )
  })

  it('resolves null on a 404 (not on prod yet)', async () => {
    stubFetch({ ok: false, status: 404 })
    expect(await fetchCharterCohortSurvivalRollup(REGION_09)).toBeNull()
  })

  it('resolves null on a contract failure', async () => {
    stubFetch({ ok: true, status: 200, body: { ...r09, asOf: 'soon' } })
    expect(await fetchCharterCohortSurvivalRollup(REGION_09)).toBeNull()
  })

  it('resolves null for a file that names another scope', async () => {
    stubFetch({ ok: true, status: 200, body: r09 })
    expect(
      await fetchCharterCohortSurvivalRollup({ kind: 'region', regionId: '05' })
    ).toBeNull()
    stubFetch({ ok: true, status: 200, body: r09 })
    expect(await fetchCharterCohortSurvivalRollup(WORLD)).toBeNull()
  })

  it('rejects on a server error, so it is not mistaken for "not yet"', async () => {
    stubFetch({ ok: false, status: 503 })
    await expect(fetchCharterCohortSurvivalRollup(WORLD)).rejects.toThrow(/503/)
  })

  it('throws on a region id that cannot name an object', () => {
    expect(() =>
      cdnCharterCohortSurvivalRollupUrl({ kind: 'region', regionId: '../9' })
    ).toThrow()
  })
})
