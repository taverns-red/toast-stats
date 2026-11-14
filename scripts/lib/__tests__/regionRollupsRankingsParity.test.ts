/**
 * Region rollups' district `distinguishedCounts.confirmed` must equal the
 * same date's rankings `distinguishedClubs` on published data (#2563, item 3;
 * the rule from #2553 and #2560).
 *
 * The content gate holds a promotion on a real mismatch. It does not hold
 * dates written before the field existed (no `distinguishedCounts`), a
 * district the rankings do not list, or a date with no rankings file.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import type { RegionRollups } from '@taverns-red/shared-contracts'
import {
  checkRollupsMatchRankings,
  type StoredObject,
} from '../promotionContentGate.js'
import { runContentGate, type GateBucket } from '../promotionContentGateIo.js'

const DATE = '2026-06-30'
const ROLLUPS_PATH = `snapshots/${DATE}/region-rollups.json`
const RANKINGS_PATH = `snapshots/${DATE}/all-districts-rankings.json`

const RECORDED = JSON.parse(
  readFileSync(
    path.join(
      process.cwd(),
      'packages/shared-contracts/src/__tests__/__fixtures__/recorded-region-rollups.json'
    ),
    'utf-8'
  )
) as RegionRollups

const counts = (confirmed: number) => ({
  confirmed,
  provisional: 0,
  byTier: {
    distinguished: { confirmed, provisional: 0 },
    select: { confirmed: 0, provisional: 0 },
    presidents: { confirmed: 0, provisional: 0 },
    smedley: { confirmed: 0, provisional: 0 },
  },
})

/** RECORDED with district d's confirmed = its position + 1, world = the sum. */
function withCounts(): RegionRollups {
  const r = structuredClone(RECORDED)
  const ids = Object.keys(r.districts)
  ids.forEach((id, n) => {
    r.districts[id]!.distinguishedCounts = counts(n + 1)
  })
  r.regions = null
  r.world.distinguishedCounts = counts(ids.reduce((a, _, n) => a + n + 1, 0))
  return r
}

const rankingsFor = (r: RegionRollups, bump: Record<string, number> = {}) => ({
  metadata: {},
  rankings: Object.entries(r.districts).map(([districtId, d]) => ({
    districtId,
    distinguishedClubs:
      (d.distinguishedCounts?.confirmed ?? 0) + (bump[districtId] ?? 0),
  })),
})

describe('checkRollupsMatchRankings (#2563)', () => {
  it('passes when every district confirmed equals the rankings figure', () => {
    const r = withCounts()
    expect(checkRollupsMatchRankings(r, rankingsFor(r))).toBeNull()
  })

  it('fails a district whose confirmed differs from the rankings', () => {
    const r = withCounts()
    expect(checkRollupsMatchRankings(r, rankingsFor(r, { '111': 1 }))).toMatch(
      /district 111.*confirmed 2.*distinguishedClubs is 3/
    )
  })

  it('skips a district that published null counts', () => {
    const r = withCounts()
    r.districts['68']!.distinguishedCounts = null
    expect(checkRollupsMatchRankings(r, rankingsFor(r, { '68': 5 }))).toBeNull()
  })

  it('passes an older file that carries no distinguishedCounts', () => {
    expect(
      checkRollupsMatchRankings(RECORDED, rankingsFor(withCounts()))
    ).toBeNull()
  })

  it('skips a district the rankings do not list', () => {
    const r = withCounts()
    const rankings = rankingsFor(r)
    rankings.rankings = rankings.rankings.filter(d => d.districtId !== '01')
    expect(checkRollupsMatchRankings(r, rankings)).toBeNull()
  })

  it('does not decide on files it cannot read (other checks report those)', () => {
    expect(checkRollupsMatchRankings({ nope: 1 }, { nope: 1 })).toBeNull()
    expect(checkRollupsMatchRankings(withCounts(), null)).toBeNull()
  })
})

describe('runContentGate: region rollups against the date rankings (#2563)', () => {
  const plain = (value: unknown): StoredObject => ({
    bytes: new Uint8Array(Buffer.from(JSON.stringify(value))),
  })

  /** Just enough of a bucket: list under a prefix, download by name. */
  function bucket(objects: Record<string, StoredObject>): GateBucket {
    return {
      async getFiles(query) {
        const prefix = String(query.prefix ?? '')
        const delimiter = query.delimiter as string | undefined
        const prefixes = new Set<string>()
        const items: Array<Record<string, string>> = []
        for (const name of Object.keys(objects).sort()) {
          if (!name.startsWith(prefix)) continue
          const rest = name.slice(prefix.length)
          const cut = delimiter ? rest.indexOf(delimiter) : -1
          if (cut >= 0) prefixes.add(prefix + rest.slice(0, cut + 1))
          else
            items.push({
              name,
              size: String(objects[name]!.bytes.length),
              md5Hash: Buffer.from(name).toString('base64'),
              crc32c: Buffer.from(name).toString('base64').slice(0, 8),
            })
        }
        const shaped = items.map(i =>
          query.fields ? i : { name: i.name, metadata: i }
        )
        return query.autoPaginate === false
          ? [shaped, null, { kind: 'storage#objects', prefixes: [...prefixes] }]
          : [shaped]
      },
      file(name) {
        return {
          async download() {
            const o = objects[name]
            if (!o) throw new Error(`No such object: ${name}`)
            return [o.bytes]
          },
        }
      },
    } as GateBucket
  }

  const run = (staged: Record<string, StoredObject>) =>
    runContentGate(bucket(staged), bucket({}), () => {}, { random: () => 0 })

  it('holds a promotion whose district confirmed differs from the rankings', async () => {
    const r = withCounts()
    const result = await run({
      [ROLLUPS_PATH]: plain(r),
      [RANKINGS_PATH]: plain(rankingsFor(r, { '111': 1 })),
    })
    expect(result.promote).toBe(false)
    expect(result.failures.map(f => f.path).join(' ')).toContain(ROLLUPS_PATH)
    expect(result.failures.map(f => f.path).join(' ')).toContain(RANKINGS_PATH)
  })

  it('promotes when they agree', async () => {
    const r = withCounts()
    const result = await run({
      [ROLLUPS_PATH]: plain(r),
      [RANKINGS_PATH]: plain(rankingsFor(r)),
    })
    expect(result.failures).toEqual([])
    expect(result.promote).toBe(true)
  })

  it('does not hold an older date whose rollups carry no counts', async () => {
    const result = await run({
      [ROLLUPS_PATH]: plain(RECORDED),
      [RANKINGS_PATH]: plain(rankingsFor(withCounts())),
    })
    expect(result.failures).toEqual([])
    expect(result.promote).toBe(true)
  })

  it('does not hold a date that has no rankings file', async () => {
    const result = await run({ [ROLLUPS_PATH]: plain(withCounts()) })
    expect(result.failures).toEqual([])
    expect(result.promote).toBe(true)
  })
})
