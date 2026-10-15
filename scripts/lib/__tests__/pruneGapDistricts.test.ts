/**
 * One-off prune of a #1671 gap district's stale per-district objects
 * (#2038).
 *
 * The 2026-06-11 build wrote `district_U.json` (and `102`) plus analytics
 * from TI's HTML error page: 0 clubs, `clubPerformance[]` of HTML lines.
 * After #2036 a rebuild records those districts as gaps and writes nothing
 * for them, but uploads and promotion only add, so the junk stays. This
 * removes it, and nothing else:
 * - only districts the bucket's OWN metadata records as a gap;
 * - only while that district's `district_<id>.json` is the 0-club junk
 *   (a file with clubs is kept and reported);
 * - only that district's `district_<id>.json` and `analytics/district_<id>_*`;
 * - each delete conditional on the listed generation;
 * - analytics first, the district file (the junk witness) last, so a re-run
 *   after a partial failure can finish.
 * Dry run plans and deletes nothing.
 *
 * The fake IO stores objects gzip-stored with generations, as GCS does;
 * the junk file is the recorded prod shape (fixtures/date-completeness).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  MAX_GAPS_PER_DATE,
  runPrune,
  type PruneIo,
} from '../pruneGapDistricts.js'
import type { StoredObjectMeta } from '../stripClubContact.js'

const FIX = path.resolve(__dirname, 'fixtures/date-completeness')
const load = (f: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf-8'))
const junkU = load('prod-district_U-gap-junk.json')
const realDistrict = load('prod-district_02.json')

const DATE = '2018-03-31'
const dir = `snapshots/${DATE}/`
const GAP = (id: string) =>
  `${id}: Skipped: club-performance.csv for district ${id} on 2018-04-18 is not a CSV (body is HTML (starts "<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML…"), not a CSV) — a gap, not zero clubs (#1671)`

const gapMetadata = (failed: string[], errors = failed.map(GAP)) => ({
  snapshotId: DATE,
  status: 'partial',
  successfulDistricts: ['01', '02'],
  failedDistricts: failed,
  errors,
})

interface Obj {
  bytes: Buffer
  generation: number
}

function fakeIo(): PruneIo & {
  objects: Map<string, Obj>
  deletes: Array<{ name: string; ifGenerationMatch: string }>
  put(name: string, value: unknown): void
} {
  const objects = new Map<string, Obj>()
  const deletes: Array<{ name: string; ifGenerationMatch: string }> = []
  let gen = 1_700_000_000_000_000
  const md5 = (b: Buffer) => createHash('md5').update(b).digest('base64')
  return {
    objects,
    deletes,
    put(name, value) {
      objects.set(name, {
        bytes: gzipSync(Buffer.from(JSON.stringify(value, null, 2))),
        generation: gen++,
      })
    },
    async list(prefix) {
      return [...objects.entries()]
        .filter(([n]) => n.startsWith(prefix))
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, o]): StoredObjectMeta => ({
          name,
          generation: String(o.generation),
          md5Hash: md5(o.bytes),
          size: String(o.bytes.length),
          contentEncoding: 'gzip',
        }))
    },
    async read(name, generation) {
      const o = objects.get(name)
      if (!o || String(o.generation) !== generation) {
        throw Object.assign(new Error('No such object'), { code: 404 })
      }
      return o.bytes
    },
    async delete(name, ifGenerationMatch) {
      deletes.push({ name, ifGenerationMatch })
      const o = objects.get(name)
      if (!o || String(o.generation) !== ifGenerationMatch) {
        throw Object.assign(new Error('precondition'), { code: 412 })
      }
      objects.delete(name)
    },
  }
}

const U_OBJECTS = [
  `${dir}analytics/district_U_analytics.json`,
  `${dir}analytics/district_U_club-trends-index.json`,
  `${dir}district_U.json`,
]

let io: ReturnType<typeof fakeIo>

beforeEach(() => {
  io = fakeIo()
  io.put(`${dir}metadata.json`, gapMetadata(['U']))
  io.put(`${dir}manifest.json`, { successfulDistricts: 2 })
  io.put(`${dir}district_01.json`, realDistrict)
  io.put(`${dir}district_02.json`, realDistrict)
  io.put(`${dir}analytics/district_02_analytics.json`, { data: {} })
  io.put(`${dir}analytics/manifest.json`, { files: [] })
  io.put(`${dir}district_U.json`, junkU)
  io.put(`${dir}analytics/district_U_analytics.json`, { data: {} })
  io.put(`${dir}analytics/district_U_club-trends-index.json`, { data: {} })
})

const run = (dryRun: boolean, dates = [DATE]) =>
  runPrune(io, { bucket: 'test-bucket', dates, dryRun })

describe('dry run', () => {
  it('plans exactly the gap district objects and deletes nothing', async () => {
    const { rows, summary } = await run(true)
    expect(io.deletes).toEqual([])
    expect(rows.filter(r => r.action === 'planned').map(r => r.path)).toEqual(
      U_OBJECTS
    )
    expect(summary).toMatchObject({
      dryRun: true,
      planned: 3,
      deleted: 0,
      kept: 0,
      errors: 0,
    })
    expect(io.objects.size).toBe(9)
  })

  it('audit rows carry identity and the recorded reason, never content', async () => {
    const { rows } = await run(true)
    const row = rows.find(r => r.path === `${dir}district_U.json`)!
    expect(row).toMatchObject({
      bucket: 'test-bucket',
      date: DATE,
      districtId: 'U',
      action: 'planned',
    })
    expect(row.generation).toMatch(/^\d+$/)
    expect(row.md5).toBeTruthy()
    expect(row.reason).toMatch(/#1671/)
    expect(JSON.stringify(rows)).not.toContain('DOCTYPE')
  })
})

describe('execute', () => {
  it('deletes the gap district objects, analytics first, district file last', async () => {
    const { summary } = await run(false)
    expect(io.deletes.map(d => d.name)).toEqual(U_OBJECTS)
    expect(summary).toMatchObject({ deleted: 3, errors: 0 })
    expect([...io.objects.keys()].some(n => n.includes('district_U'))).toBe(
      false
    )
    // Everything else on the date is untouched.
    expect(io.objects.size).toBe(6)
  })

  it('every delete is conditional on the listed generation', async () => {
    const before = await io.list(dir)
    const gens = new Map(before.map(o => [o.name, o.generation]))
    await run(false)
    for (const d of io.deletes) {
      expect(d.ifGenerationMatch).toBe(gens.get(d.name))
    }
  })

  it('a re-run finds nothing to do', async () => {
    await run(false)
    io.deletes.length = 0
    const { summary } = await run(false)
    expect(io.deletes).toEqual([])
    expect(summary).toMatchObject({ planned: 0, deleted: 0, errors: 0 })
  })

  it('a concurrent rewrite (412) is an error row and the junk witness stays', async () => {
    const name = `${dir}analytics/district_U_analytics.json`
    const realDelete = io.delete.bind(io)
    io.delete = async (n, g) => {
      if (n === name) io.put(n, { data: { rewritten: true } })
      return realDelete(n, g)
    }
    const { rows, summary } = await run(false)
    expect(rows.find(r => r.path === name)!.action).toBe('error')
    expect(summary.errors).toBeGreaterThan(0)
    // The district file is not deleted while a sibling failed, so a re-run
    // can still prove the district is junk.
    expect(io.objects.has(`${dir}district_U.json`)).toBe(true)
  })
})

describe('what it refuses', () => {
  it('keeps a gap district whose file has clubs', async () => {
    io.put(`${dir}district_U.json`, { ...(realDistrict as object) })
    const { rows, summary } = await run(false)
    expect(io.deletes).toEqual([])
    expect(summary).toMatchObject({ kept: 3, deleted: 0 })
    expect(rows.find(r => r.path === `${dir}district_U.json`)!.reason).toMatch(
      /3 club/
    )
  })

  it('keeps a gap district with no district file to prove it is junk', async () => {
    io.objects.delete(`${dir}district_U.json`)
    const { summary } = await run(false)
    expect(io.deletes).toEqual([])
    expect(summary).toMatchObject({ kept: 2, deleted: 0 })
  })

  it('ignores a failure whose reason is not a source gap', async () => {
    io.put(
      `${dir}metadata.json`,
      gapMetadata(['U'], ['U: Raw CSV data not found for district U'])
    )
    const { rows } = await run(false)
    expect(io.deletes).toEqual([])
    expect(rows).toEqual([])
  })

  it('ignores a gap that metadata also lists as successful', async () => {
    io.put(`${dir}metadata.json`, {
      ...gapMetadata(['U']),
      successfulDistricts: ['01', '02', 'U'],
    })
    await run(false)
    expect(io.deletes).toEqual([])
  })

  it('never touches a district metadata does not name', async () => {
    io.put(`${dir}metadata.json`, gapMetadata(['U']))
    await run(false)
    expect(io.deletes.every(d => d.name.includes('district_U'))).toBe(true)
    expect(io.objects.has(`${dir}district_02.json`)).toBe(true)
    expect(io.objects.has(`${dir}analytics/district_02_analytics.json`)).toBe(
      true
    )
  })

  it('a date without metadata is an error, not a guess', async () => {
    io.objects.delete(`${dir}metadata.json`)
    const { rows, summary } = await run(false)
    expect(io.deletes).toEqual([])
    expect(summary.errors).toBe(1)
    expect(rows[0]!.path).toBe(`${dir}metadata.json`)
  })

  it(`refuses a date recording more than ${MAX_GAPS_PER_DATE} gaps`, async () => {
    const many = Array.from({ length: MAX_GAPS_PER_DATE + 1 }, (_, i) =>
      String(200 + i)
    )
    io.put(`${dir}metadata.json`, gapMetadata(many))
    const { summary } = await run(false)
    expect(io.deletes).toEqual([])
    expect(summary.errors).toBe(1)
  })

  it('a date with no objects is an error (no metadata to read)', async () => {
    const { rows } = await run(false, ['2018-02-28'])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.action).toBe('error')
    expect(io.deletes).toEqual([])
  })
})
