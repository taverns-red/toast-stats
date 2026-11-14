import { describe, it, expect } from 'vitest'
import {
  parseListing,
  planRestore,
  verifyPlan,
  executePlan,
  RestorePlanError,
} from '../dataRestorePlan.js'

/**
 * Listings in the shape `gcloud storage ls --json [--soft-deleted]` prints:
 * [{url, type: 'cloud_object', metadata: <JSON API object resource>}], with
 * the resource's camelCase fields (generation is a string; timeCreated,
 * softDeleteTime, hardDeleteTime are RFC 3339).
 */
const BUCKET = 'toast-stats-data-ca'

function obj(
  name: string,
  generation: string,
  timeCreated: string,
  softDeleteTime?: string,
  hardDeleteTime?: string
) {
  return {
    url: `gs://${BUCKET}/${name}#${generation}`,
    type: 'cloud_object',
    metadata: {
      bucket: BUCKET,
      name,
      generation,
      timeCreated,
      ...(softDeleteTime ? { softDeleteTime } : {}),
      ...(hardDeleteTime ? { hardDeleteTime } : {}),
    },
  }
}

// The bad run promoted at 2026-11-08T10:12:00Z.
const SINCE = '2026-11-08T10:00:00Z'
const BAD = '2026-11-08T10:12:23.000000Z'

const plan = (live: unknown[], soft: unknown[]) =>
  planRestore({
    live: parseListing(live),
    softDeleted: parseListing(soft),
    since: SINCE,
  })

describe('planRestore', () => {
  it('restores the copy displaced by a single overwrite', () => {
    const p = plan(
      [obj('v1/latest.json', '300', BAD)],
      [
        obj(
          'v1/latest.json',
          '200',
          '2026-11-07T10:12:00Z',
          BAD,
          '2026-11-22T10:12:23Z'
        ),
      ]
    )
    expect(p.entries).toEqual([
      expect.objectContaining({
        name: 'v1/latest.json',
        action: 'restore',
        generation: '200',
        liveGeneration: '300',
      }),
    ])
    expect(p.entries[0]?.reason).toMatch(/soft_delete_time|softDeleteTime/i)
  })

  it('walks back through several overwrites in the bad window', () => {
    // 100 (good, before the run) -> 200 (bad run, 10:05) -> 300 (rerun, 10:12)
    const mid = '2026-11-08T10:05:00Z'
    const p = plan(
      [obj('v1/dates.json', '300', BAD)],
      [
        obj('v1/dates.json', '100', '2026-11-07T10:00:00Z', mid),
        obj('v1/dates.json', '200', mid, BAD),
        // an unrelated older copy must not confuse the match
        obj(
          'v1/dates.json',
          '50',
          '2026-11-05T10:00:00Z',
          '2026-11-07T10:00:00Z'
        ),
      ]
    )
    expect(p.entries[0]).toMatchObject({ action: 'restore', generation: '100' })
  })

  it('deletes an object the bad run created', () => {
    const p = plan([obj('snapshots/2026-11-08/metadata.json', '300', BAD)], [])
    expect(p.entries[0]).toMatchObject({
      name: 'snapshots/2026-11-08/metadata.json',
      action: 'delete',
      liveGeneration: '300',
    })
    expect(p.entries[0]?.generation).toBeUndefined()
  })

  it('deletes an object created in the bad window then overwritten', () => {
    const mid = '2026-11-08T10:05:00Z'
    const p = plan(
      [obj('snapshots/2026-11-08/a.json', '300', BAD)],
      [obj('snapshots/2026-11-08/a.json', '200', mid, BAD)]
    )
    expect(p.entries[0]).toMatchObject({ action: 'delete' })
  })

  it('leaves objects the bad run did not touch alone', () => {
    const p = plan(
      [obj('snapshots/2026-10-01/x.json', '10', '2026-10-01T00:00:00Z')],
      []
    )
    expect(p.entries[0]).toMatchObject({ action: 'noop' })
  })

  it('picks a copy from before the policy change (30-day hard delete)', () => {
    const p = plan(
      [obj('v1/latest.json', '300', BAD)],
      [
        obj(
          'v1/latest.json',
          '200',
          '2026-10-09T12:22:27Z',
          BAD,
          '2026-12-07T10:12:23Z'
        ),
      ]
    )
    expect(p.entries[0]).toMatchObject({ action: 'restore', generation: '200' })
    expect(p.entries[0]?.hardDeleteTime).toBe('2026-12-07T10:12:23Z')
  })

  it('compares timestamps by instant, not by string', () => {
    const p = plan(
      [obj('v1/latest.json', '300', '2026-11-08T10:12:23Z')],
      [
        obj(
          'v1/latest.json',
          '200',
          '2026-11-07T10:00:00Z',
          '2026-11-08T10:12:23.000000+00:00'
        ),
      ]
    )
    expect(p.entries[0]).toMatchObject({ action: 'restore', generation: '200' })
  })

  it('refuses when copies exist but none matches the live creation time', () => {
    const p = plan(
      [obj('v1/latest.json', '300', BAD)],
      [
        obj(
          'v1/latest.json',
          '200',
          '2026-11-07T10:00:00Z',
          '2026-11-08T09:00:00Z'
        ),
      ]
    )
    expect(p.entries[0]).toMatchObject({ action: 'refuse' })
    expect(p.entries[0]?.generation).toBeUndefined()
    expect(p.refused).toBe(1)
  })

  it('refuses when two copies match (ambiguous)', () => {
    const p = plan(
      [obj('v1/latest.json', '300', BAD)],
      [
        obj('v1/latest.json', '200', '2026-11-07T10:00:00Z', BAD),
        obj('v1/latest.json', '201', '2026-11-07T11:00:00Z', BAD),
      ]
    )
    expect(p.entries[0]).toMatchObject({ action: 'refuse' })
  })

  it('refuses a listing it cannot read instead of guessing', () => {
    expect(() =>
      parseListing([{ url: 'gs://b/x', type: 'cloud_object' }])
    ).toThrow(RestorePlanError)
    expect(() => parseListing({})).toThrow(RestorePlanError)
  })

  it('limits the plan to the given paths', () => {
    const p = planRestore({
      live: parseListing([obj('a.json', '1', BAD), obj('b.json', '2', BAD)]),
      softDeleted: parseListing([]),
      since: SINCE,
      paths: ['a.json'],
    })
    expect(p.entries.map(e => e.name)).toEqual(['a.json'])
  })

  it('is deterministic: entries sorted by name', () => {
    const p = plan([obj('b.json', '2', BAD), obj('a.json', '1', BAD)], [])
    expect(p.entries.map(e => e.name)).toEqual(['a.json', 'b.json'])
  })
})

describe('verifyPlan / executePlan', () => {
  const live = [obj('v1/latest.json', '300', BAD), obj('new.json', '301', BAD)]
  const soft = [obj('v1/latest.json', '200', '2026-11-07T10:00:00Z', BAD)]
  const savedPlan = () => plan(live, soft)

  it('accepts a plan that matches the current listing', () => {
    expect(() => verifyPlan(savedPlan(), plan(live, soft))).not.toThrow()
  })

  it('refuses when the live object changed since the plan', () => {
    const moved = plan(
      [
        obj('v1/latest.json', '400', '2026-11-08T11:00:00Z'),
        obj('new.json', '301', BAD),
      ],
      soft
    )
    expect(() => verifyPlan(savedPlan(), moved)).toThrow(/does not match/i)
  })

  it('refuses a plan containing a refused entry', () => {
    const bad = plan(
      [obj('x.json', '3', BAD)],
      [obj('x.json', '2', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z')]
    )
    expect(() => verifyPlan(bad, bad)).toThrow(/refus/i)
  })

  it('executes restores (entry points first) then deletes, as argv', () => {
    const calls: string[][] = []
    executePlan(savedPlan(), argv => {
      calls.push(argv)
    })
    expect(calls).toEqual([
      [
        'storage',
        'restore',
        '--allow-overwrite',
        `gs://${BUCKET}/v1/latest.json#200`,
      ],
      ['storage', 'rm', `gs://${BUCKET}/new.json#301`],
    ])
  })
})
