/**
 * The contact strip validates every object kind it rewrites (#2183).
 *
 * Incident 2026-10-19: the #2157 repair (contact-strip run 39305229628)
 * rewrote prod `snapshots/2026-10-18/clubs-by-region/{01,02,13}.json`. In
 * three rows the city was only a meeting passcode, the scrub emptied it and
 * the tool dropped the `city` key. `ClubsByRegionClubSchema` requires it
 * (`z.string().nullable()`), so each whole shard failed validation and the
 * region map pages showed "not available". The tool reported
 * `schemaFailures: 0`: it had no schema for a nested clubs-by-region path.
 *
 * Fixtures follow the recorded prod shard shape (compact JSON, one gzip
 * layer, the row keys and types of prod 13.json read 2026-10-19); values
 * are placeholders and the passcode is redacted.
 */

import { describe, it, expect } from 'vitest'
import { gunzipSync, gzipSync } from 'node:zlib'
import {
  ClubsByRegionShardSchema,
  ClubsByRegionWorldSchema,
} from '@taverns-red/shared-contracts'
import {
  checkRewriteSchema,
  schemaForObject,
  stripStoredObject,
  StripError,
} from '../stripClubContact.js'

const DATE = '2026-10-18'
const SHARD_PATH = `snapshots/${DATE}/clubs-by-region/02.json`
const WORLD_PATH = `snapshots/${DATE}/clubs-by-region/world.json`
const POINTS_PATH = `snapshots/${DATE}/clubs-by-region/world-points.json`
/** The passcode-only city (redacted) that the scrub empties. */
const CREDENTIAL_ONLY_CITY = 'Passcode: 000000'

function row(id: string, city: string | null) {
  return {
    id,
    name: `Club ${id}`,
    d: '17',
    region: '02',
    division: 'A',
    area: '1',
    city,
    status: 'Active',
    h: 't',
    t: null,
    tp: false,
    members: 20,
    base: 18,
    dcpGoals: 3,
    csp: true,
    lat: null,
    lng: null,
  }
}

function shard(rows: ReturnType<typeof row>[]) {
  return {
    _format: { version: '1.0.0', type: 'clubs-by-region-shard' },
    snapshotDate: DATE,
    programYear: '2026-2027',
    generatedAt: '2026-10-18T10:00:00.000Z',
    region: '02',
    regionMembership: {
      source: 'config/district-region-history.json',
      asOf: '2026-10-17',
      programYear: '2026-2027',
    },
    districtIds: ['17'],
    counts: { clubs: rows.length, mapped: 0, unmapped: rows.length },
    clubs: rows,
  }
}

function world(top: ReturnType<typeof row>[]) {
  return {
    _format: { version: '1.0.0', type: 'clubs-by-region-world' },
    snapshotDate: DATE,
    programYear: '2026-2027',
    generatedAt: '2026-10-18T10:00:00.000Z',
    regionMembership: null,
    regionMembershipNote: null,
    totals: { districts: 1, clubs: 2, mapped: 0, unmapped: 2 },
    shards: null,
    top: { membership: top, netGrowth: top, dcpGoals: top },
    pointsPath: 'clubs-by-region/world-points.json',
    scope: { excludedDistricts: [], duplicateClubs: [] },
  }
}

/** Stored as the pipeline writes it: compact JSON, gzip level 9. */
const stored = (value: unknown) =>
  gzipSync(Buffer.from(JSON.stringify(value)), { level: 9 })
const read = (bytes: Buffer) => JSON.parse(gunzipSync(bytes).toString())

describe('the fixtures are valid prod shapes', () => {
  it('shard and world pass their shared-contracts schemas', () => {
    const rows = [row('100', 'Springfield'), row('7893475', 'Pine Bluff')]
    expect(ClubsByRegionShardSchema.safeParse(shard(rows)).success).toBe(true)
    expect(ClubsByRegionWorldSchema.safeParse(world(rows)).success).toBe(true)
  })
})

describe('schemaForObject covers the clubs-by-region files (#2183)', () => {
  it.each([
    [SHARD_PATH, 'clubs-by-region-shard'],
    [
      `snapshots/${DATE}/clubs-by-region/unassigned.json`,
      'clubs-by-region-shard',
    ],
    [WORLD_PATH, 'clubs-by-region-world'],
    [POINTS_PATH, 'clubs-by-region-world-points'],
    [`snapshots/${DATE}/region-rollups.json`, 'region-rollups'],
    [`snapshots/${DATE}/global-totals.json`, 'global-totals'],
    [`snapshots/${DATE}/global-club-race.json`, 'global-club-race'],
    [`snapshots/${DATE}/suspended-clubs.json`, 'suspended-clubs'],
  ])('%s → %s', (path, id) => {
    expect(schemaForObject(path)?.id).toBe(id)
  })

  it('reports a dropped shard city as a new issue', () => {
    const before = shard([row('7893475', 'Springfield')])
    const { city: _city, ...cityless } = before.clubs[0]!
    const after = { ...before, clubs: [cityless] }
    const check = checkRewriteSchema(SHARD_PATH, before, after)
    expect(check.schema).toBe('clubs-by-region-shard')
    expect(check.after).toBe('fail')
    expect(check.newIssues).toBeGreaterThan(0)
  })
})

describe('a city that scrubs to empty takes its schema-correct form (#2183)', () => {
  it('a shard row whose city is only a credential gets city: null', () => {
    const before = shard([
      row('100', 'Springfield'),
      row('7893475', CREDENTIAL_ONLY_CITY),
    ])
    const result = stripStoredObject(stored(before), SHARD_PATH)
    expect(result.changed).toBe(true)
    if (!result.changed) return
    const after = read(result.bytes)
    expect(after.clubs[1]).toHaveProperty('city', null)
    expect(after.clubs[0].city).toBe('Springfield')
    expect(ClubsByRegionShardSchema.safeParse(after).success).toBe(true)
    expect(result.schemaCheck).toMatchObject({
      schema: 'clubs-by-region-shard',
      before: 'pass',
      after: 'pass',
      newIssues: 0,
    })
    // Only the scrubbed value changed: same compact format.
    const expected = structuredClone(before)
    expected.clubs[1]!.city = null
    expect(gunzipSync(result.bytes).toString()).toBe(JSON.stringify(expected))
  })

  it('a world top-list row whose city is only a credential gets city: null', () => {
    const before = world([row('7893475', CREDENTIAL_ONLY_CITY)])
    const result = stripStoredObject(stored(before), WORLD_PATH)
    expect(result.changed).toBe(true)
    if (!result.changed) return
    const after = read(result.bytes)
    for (const list of ['membership', 'netGrowth', 'dcpGoals']) {
      expect(after.top[list][0]).toHaveProperty('city', null)
    }
    expect(ClubsByRegionWorldSchema.safeParse(after).success).toBe(true)
    expect(result.schemaCheck.schema).toBe('clubs-by-region-world')
  })

  it('an analytics file still drops an emptied optional address.city (optional in analytics-core)', () => {
    const district = {
      districtId: '17',
      status: 'success',
      data: {
        districtId: '17',
        snapshotDate: DATE,
        clubs: [
          {
            clubId: '7893475',
            clubName: 'Club X',
            address: { street: '9 Main St', city: CREDENTIAL_ONLY_CITY },
          },
        ],
      },
    }
    const result = stripStoredObject(
      stored(district),
      `snapshots/${DATE}/analytics/district_17_analytics.json`
    )
    expect(result.changed).toBe(true)
    if (!result.changed) return
    expect(read(result.bytes).data.clubs[0].address).toEqual({
      street: '9 Main St',
    })
  })
})

describe('a kind with no schema fails closed (#2183)', () => {
  it('refuses a rewrite that would drop a key from an unvalidated kind', () => {
    const unknown = { clubs: [{ id: '7893475', city: CREDENTIAL_ONLY_CITY }] }
    expect(() =>
      stripStoredObject(
        stored(unknown),
        `snapshots/${DATE}/competitive-awards.json`
      )
    ).toThrow(StripError)
  })

  it('still rewrites an unvalidated kind when no key is dropped', () => {
    const unknown = {
      clubs: [{ id: '1', city: 'Springfield Passcode: 000000' }],
    }
    const result = stripStoredObject(
      stored(unknown),
      `snapshots/${DATE}/competitive-awards.json`
    )
    expect(result.changed).toBe(true)
    if (!result.changed) return
    expect(read(result.bytes).clubs[0].city).toBe('Springfield')
  })
})
