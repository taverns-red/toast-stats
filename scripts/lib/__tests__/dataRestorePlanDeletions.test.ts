/**
 * The restore plan and prod deletions (#2856, follow-up to #2537).
 *
 * The run removes some prod objects on purpose: a #2232 gap district's
 * 0-club junk, and the date prefixes a prune reconcile drops. Each is
 * written to the removal record when it happens (promoteRunManifestRunner).
 * The plan reads that record: a recorded removal is never restored, and a
 * deletion that is NOT in it is unexplained and restorable. Intent is never
 * inferred from an object's content or size.
 */

import { describe, it, expect } from 'vitest'
import {
  executePlan,
  parseListing,
  parseRemovalRecord,
  parseSavedPlan,
  planRestore,
  RestorePlanError,
  type RemovalRecord,
} from '../dataRestorePlan.js'

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

const SINCE = '2026-11-08T10:00:00Z'
const UNTIL = '2026-11-08T11:00:00Z'
const NOW = Date.parse('2026-11-10T00:00:00Z')
// A soft-deleted copy of some other object, so the soft listing is not empty.
const OTHER = obj(
  'other.json',
  '1',
  '2026-11-01T00:00:00Z',
  '2026-11-02T00:00:00Z'
)

const GAP = 'snapshots/2026-10-10/district_U.json'
const PRUNED = 'snapshots/2026-09-15/'
const WRITTEN = 'snapshots/2026-11-08/district_61.json'
const DELETED_AT = '2026-11-08T10:30:00.000000Z'
const deletedCopy = obj(
  WRITTEN,
  '100',
  '2026-11-07T10:12:00Z',
  DELETED_AT,
  '2026-11-22T10:30:00Z'
)

const planWith = (
  removals: RemovalRecord[],
  live: unknown[],
  soft: unknown[],
  paths: string[]
) =>
  planRestore({
    live: parseListing(live),
    softDeleted: parseListing(soft),
    since: SINCE,
    until: UNTIL,
    paths,
    removals,
    now: NOW,
  })
const find = (p: ReturnType<typeof planRestore>, name: string) =>
  p.entries.find(e => e.name === name)

describe('planRestore: prod deletions and the removal record (#2856)', () => {
  it('classes a deletion that is not in the record as unexplained and restorable', () => {
    const p = planWith([], [], [deletedCopy, OTHER], [WRITTEN])
    expect(find(p, WRITTEN)).toMatchObject({
      action: 'restore',
      generation: '100',
      // Nothing is live: the restore must find the name still empty.
      liveGeneration: '0',
    })
    expect(find(p, WRITTEN)?.reason).toMatch(/not in the removal record/)
  })

  it('does not restore a #2232 gap removal: removed on purpose', () => {
    const copy = obj(
      GAP,
      '7',
      '2026-10-10T08:00:00Z',
      DELETED_AT,
      '2026-11-22T10:30:00Z'
    )
    const p = planWith([{ path: GAP, kind: 'gap' }], [], [copy, OTHER], [])
    expect(find(p, GAP)).toMatchObject({ action: 'excluded' })
    expect(find(p, GAP)?.reason).toMatch(/on purpose/)
    expect(p.entries.some(e => e.action === 'restore')).toBe(false)
  })

  it('lists a prune delete as not restorable automatically, whatever it held', () => {
    const p = planWith([{ path: PRUNED, kind: 'prune' }], [], [OTHER], [])
    expect(find(p, PRUNED)).toMatchObject({ action: 'manual' })
    expect(find(p, PRUNED)?.reason).toMatch(/not restorable automatically/)
  })

  it('a recorded name is never also restored, even when it was written and soft-deleted', () => {
    const p = planWith(
      [{ path: WRITTEN, kind: 'gap' }],
      [],
      [deletedCopy, OTHER],
      [WRITTEN]
    )
    expect(p.entries.filter(e => e.name === WRITTEN)).toEqual([
      expect.objectContaining({ action: 'excluded' }),
    ])
  })

  it('a written name under a pruned prefix is covered by the record', () => {
    const name = 'snapshots/2026-09-15/district_61.json'
    const copy = obj(name, '5', '2026-09-16T00:00:00Z', DELETED_AT)
    const p = planWith(
      [{ path: PRUNED, kind: 'prune' }],
      [],
      [copy, OTHER],
      [name]
    )
    expect(find(p, name)).toBeUndefined()
    expect(find(p, PRUNED)).toMatchObject({ action: 'manual' })
  })

  it('a written name that was never in prod (a held date) is not a deletion', () => {
    const p = planWith([], [], [OTHER], [WRITTEN])
    expect(find(p, WRITTEN)).toBeUndefined()
  })

  it('a soft-deleted copy from outside the run window is not this run’s deletion', () => {
    const old = obj(
      WRITTEN,
      '9',
      '2026-10-01T00:00:00Z',
      '2026-10-02T00:00:00Z',
      '2026-10-16T00:00:00Z'
    )
    const p = planWith([], [], [old, OTHER], [WRITTEN])
    expect(find(p, WRITTEN)).toBeUndefined()
  })

  it('refuses an unexplained deletion whose newest copy the run itself created', () => {
    const born = obj(WRITTEN, '8', '2026-11-08T10:20:00Z', DELETED_AT)
    const p = planWith([], [], [born, OTHER], [WRITTEN])
    expect(find(p, WRITTEN)).toMatchObject({ action: 'refuse' })
    expect(p.refused).toBe(1)
  })

  it('executes an unexplained restore only while the name is still empty', () => {
    const p = planWith([], [], [deletedCopy, OTHER], [WRITTEN])
    const ran: string[][] = []
    executePlan(p, argv => ran.push(argv))
    expect(ran).toEqual([
      [
        'storage',
        'restore',
        '--allow-overwrite',
        '--if-generation-match=0',
        `gs://${BUCKET}/${WRITTEN}#100`,
      ],
    ])
  })

  it('never acts on an excluded or manual entry', () => {
    const p = planWith(
      [
        { path: GAP, kind: 'gap' },
        { path: PRUNED, kind: 'prune' },
      ],
      [],
      [OTHER],
      []
    )
    const ran: string[][] = []
    executePlan(p, argv => ran.push(argv))
    expect(ran).toEqual([])
  })

  it('a saved plan with excluded and manual entries is accepted', () => {
    const p = planWith([{ path: GAP, kind: 'gap' }], [], [OTHER], [])
    expect(parseSavedPlan(JSON.parse(JSON.stringify(p)))).toEqual(p)
  })
})

describe('parseRemovalRecord (#2856)', () => {
  it('reads one record per line', () => {
    expect(
      parseRemovalRecord(
        '{"path":"snapshots/2026-10-10/district_U.json","kind":"gap","date":"2026-10-10"}\n' +
          '{"path":"snapshots/2026-09-15/","kind":"prune","date":"2026-09-15"}\n'
      )
    ).toEqual([
      { path: 'snapshots/2026-10-10/district_U.json', kind: 'gap' },
      { path: 'snapshots/2026-09-15/', kind: 'prune' },
    ])
  })

  it('treats an empty or absent record as no removals', () => {
    expect(parseRemovalRecord('')).toEqual([])
    expect(parseRemovalRecord('\n\n')).toEqual([])
  })

  it('refuses a malformed record rather than reading it as empty', () => {
    expect(() => parseRemovalRecord('not json\n')).toThrow(RestorePlanError)
    expect(() => parseRemovalRecord('{"path":"a","kind":"x"}\n')).toThrow(
      RestorePlanError
    )
    expect(() => parseRemovalRecord('{"kind":"gap"}\n')).toThrow(
      RestorePlanError
    )
  })
})
