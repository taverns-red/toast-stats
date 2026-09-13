import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCdnGlobalClubRace } from '../cdn'
import { snap } from '../../test-utils/snapshotDate'

/**
 * #1556 — `snapshots/{date}/global-club-race.json` is the ONE request the
 * whole `/clubs` area makes. Absent (pre-feature dates) is `null`, not a
 * thrown error; an off-contract body is `null` too, never a half-rendered
 * race.
 */

const okResponse = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
  }) as unknown as Response

const notFound = (): Response =>
  ({ ok: false, status: 404, headers: new Headers() }) as unknown as Response

const VALID = {
  _format: { version: '1.0.0', type: 'global-club-race' },
  date: '2026-09-11',
  programYear: '2026-2027',
  generatedAt: '2026-09-11T10:00:00.000Z',
  scope: {
    districts: { total: 1, numbered: 1, includesUndistricted: false },
    clubsScanned: 1,
    excludedDistricts: [],
    missingDistricts: [],
    reachedAbsentToday: 0,
    officialWithoutDerived: 0,
  },
  ruleset: {
    programYear: '2026-2027',
    cspRequired: true,
    smedleyAvailable: true,
    membershipBasis: 'confirmed-renewals',
    officialRecognitionFrom: '2027-04-01',
    tiers: [],
  },
  observation: {
    firstObservedDate: '2026-09-11',
    previousSnapshotDate: null,
    observedDates: 1,
    resolution: 'unknown',
  },
  timeline: [],
  distribution: {
    goalsMet: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    membership: { lt12: 1, from12to19: 0, from20to24: 0, ge25: 0 },
    byTierRequirementsMet: {
      none: 1,
      Distinguished: 0,
      Select: 0,
      President: 0,
      Smedley: 0,
    },
    byOfficialCode: { none: 1, D: 0, S: 0, P: 0, M: 0 },
    cohorts: {
      lt12: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      from12to19: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      from20to24: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ge25: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
  },
  reached: [],
  byDistrict: [],
}

afterEach(() => vi.restoreAllMocks())

describe('fetchCdnGlobalClubRace (#1556)', () => {
  it('reads snapshots/{date}/global-club-race.json and returns the parsed artifact', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse(VALID))

    const race = await fetchCdnGlobalClubRace(snap('2026-09-11'))

    expect(String(fetchSpy.mock.calls[0]?.[0])).toMatch(
      /\/snapshots\/2026-09-11\/global-club-race\.json$/
    )
    expect(race?.date).toBe('2026-09-11')
    expect(race?.ruleset.membershipBasis).toBe('confirmed-renewals')
  })

  it('returns null when the artifact is absent for the date', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(notFound())
    expect(await fetchCdnGlobalClubRace(snap('2026-06-30'))).toBeNull()
  })

  it('returns null, not a partial object, when the body is off-contract', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse({ ...VALID, _format: { version: '1.0.0', type: 'other' } })
    )
    expect(await fetchCdnGlobalClubRace(snap('2026-09-11'))).toBeNull()
  })

  it('returns null when the network throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    expect(await fetchCdnGlobalClubRace(snap('2026-09-11'))).toBeNull()
  })
})
