/**
 * Property tests for the restore plan (#2930, follow-up to #2903 and #2927).
 *
 * Two reviews of #2927 found fail-open cases the example tests missed: a name
 * still live under a recorded removal, and a live object under a recorded
 * prune prefix. Both would have planned a restore of data removed on purpose.
 * These properties generate written names, removal records (exact names, gaps
 * and prune prefixes) and live or soft-deleted generations, and check what
 * must hold for all of them. A fixed seed keeps CI deterministic.
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  executePlan,
  planRestore,
  type ObjectCopy,
  type RemovalRecord,
  type RestorePlan,
} from '../dataRestorePlan.js'

const BUCKET = 'toast-stats-data-ca'
const SINCE = '2026-11-08T10:00:00Z'
const UNTIL = '2026-11-08T11:00:00Z'
const NOW = Date.parse('2026-11-10T00:00:00Z')
const LATE_NOW = Date.parse('2026-12-01T00:00:00Z')
const RUN = { seed: 2930, numRuns: 300 }

// Times chosen to straddle the run window and to repeat, so soft-delete chains
// (softDeleteTime equal to a replacing generation's timeCreated) actually form.
const TIMES = [
  '2026-09-16T00:00:00Z',
  '2026-11-01T00:00:00Z',
  '2026-11-07T10:12:00Z',
  '2026-11-08T09:59:59Z',
  '2026-11-08T10:00:00Z',
  '2026-11-08T10:20:00Z',
  '2026-11-08T10:30:00Z',
  '2026-11-08T10:45:00Z',
  '2026-11-08T11:00:00Z',
  '2026-11-09T00:00:00Z',
]

const timeArb = fc.constantFrom(...TIMES)
const dirArb = fc.constantFrom('snapshots', 'raw-csv')
const dateArb = fc.constantFrom('2026-09-15', '2026-10-10', '2026-11-08')
const fileArb = fc.constantFrom('district_61.json', 'district_U.json')

const nameArb = fc
  .tuple(dirArb, dateArb, fileArb)
  .map(([dir, date, file]) => `${dir}/${date}/${file}`)
const prefixArb = fc
  .tuple(dirArb, dateArb)
  .map(([dir, date]) => `${dir}/${date}/`)
const kindArb = fc.constantFrom<RemovalRecord['kind']>('gap', 'prune')

const removalArb: fc.Arbitrary<RemovalRecord> = fc.record({
  path: fc.oneof(nameArb, prefixArb),
  kind: kindArb,
})

interface Scenario {
  live: ObjectCopy[]
  softDeleted: ObjectCopy[]
  removals: RemovalRecord[]
  paths: string[] | undefined
  now: number
}

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    live: fc.uniqueArray(fc.record({ name: nameArb, timeCreated: timeArb }), {
      selector: o => o.name,
      maxLength: 6,
    }),
    soft: fc.array(
      fc.record({
        name: nameArb,
        timeCreated: timeArb,
        softDeleteTime: timeArb,
      }),
      { maxLength: 8 }
    ),
    removals: fc.array(removalArb, { maxLength: 4 }),
    written: fc.uniqueArray(nameArb, { maxLength: 8 }),
    useWritten: fc.boolean(),
    expired: fc.boolean(),
  })
  .map(s => ({
    live: s.live.map((o, i) => ({
      name: o.name,
      bucket: BUCKET,
      generation: `L${i + 1}`,
      timeCreated: o.timeCreated,
    })),
    softDeleted: s.soft.map((o, i) => ({
      name: o.name,
      bucket: BUCKET,
      generation: `S${i + 1}`,
      timeCreated: o.timeCreated,
      softDeleteTime: o.softDeleteTime,
    })),
    removals: s.removals,
    paths: s.useWritten ? s.written : undefined,
    now: s.expired ? LATE_NOW : NOW,
  }))

const plan = (s: Scenario): RestorePlan =>
  planRestore({
    live: s.live,
    softDeleted: s.softDeleted,
    since: SINCE,
    until: UNTIL,
    paths: s.paths,
    removals: s.removals,
    now: s.now,
  })

/**
 * The oracle, written from the spec and not from the planner's `isRecorded`
 * (#2934): a name is recorded when it equals a recorded path, or when it sits
 * under a recorded `prefix/`. Compared by path segment, so a bug that the
 * planner's startsWith/endsWith test shares would not hide here.
 */
const isRecorded = (name: string, removals: RemovalRecord[]): boolean => {
  const nameParts = name.split('/')
  return removals.some(r => {
    if (!r.path.endsWith('/')) return name === r.path
    const prefixParts = r.path.slice(0, -1).split('/')
    return (
      nameParts.length > prefixParts.length &&
      prefixParts.every((part, i) => nameParts[i] === part)
    )
  })
}

describe('planRestore properties (#2930)', () => {
  it('never restores or deletes a recorded name or a name under a recorded prefix', () => {
    fc.assert(
      fc.property(scenarioArb, s => {
        const p = plan(s)
        const bad = p.entries.filter(
          e =>
            (e.action === 'restore' || e.action === 'delete') &&
            isRecorded(e.name, s.removals)
        )
        expect(bad).toEqual([])
      }),
      RUN
    )
  })

  it('plans at most one entry per name', () => {
    fc.assert(
      fc.property(scenarioArb, s => {
        const names = plan(s).entries.map(e => e.name)
        expect(new Set(names).size).toBe(names.length)
      }),
      RUN
    )
  })

  it('executePlan runs a command for every restore and delete entry and for nothing else', () => {
    fc.assert(
      fc.property(scenarioArb, s => {
        const p = plan(s)
        const ran: string[][] = []
        executePlan(p, argv => ran.push(argv))
        const expected = p.entries
          .filter(e => e.action === 'restore' || e.action === 'delete')
          .map(e =>
            e.action === 'restore'
              ? `gs://${BUCKET}/${e.name}#${e.generation}`
              : `gs://${BUCKET}/${e.name}#${e.liveGeneration}`
          )
        const targets = ran.map(argv => argv[argv.length - 1])
        expect([...targets].sort()).toEqual([...expected].sort())
        // No manual, refuse, excluded or noop entry is the target of a command.
        const inert = new Set(
          p.entries
            .filter(e => e.action !== 'restore' && e.action !== 'delete')
            .map(e => e.name)
        )
        for (const argv of ran) {
          const url = argv[argv.length - 1] as string
          const name = url.slice(`gs://${BUCKET}/`.length, url.indexOf('#'))
          expect(inert.has(name)).toBe(false)
        }
      }),
      RUN
    )
  })
})
