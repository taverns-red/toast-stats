/**
 * ClubTrendsStore drops the zero-padded duplicate club keys (#2100).
 *
 * #1447 moved transform club ids to the canonical bare form, but stores
 * written before it keep the old `00000180` key next to the new `180` one.
 * Values are unaffected (every overlapping date agrees), so this is store
 * hygiene: `load` merges each padded key into its canonical key, and the next
 * save writes a clean store. There is no separate GCS rewrite.
 *
 * Fixtures are trimmed from two recorded D61 PY 2017-2018 stores, read as
 * single objects on 2026-10-17:
 *   - prod.json: the stale prod copy (built 10-04). The canonical key holds
 *     only the June point; the padded key holds all 12 month-ends. One club
 *     (00004856) exists only under its padded key.
 *   - staging.json: the live store. After the #1759 re-folds both keys hold
 *     the same 12 points.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ClubTrendsStore,
  type ClubTrendsStoreData,
} from '../ClubTrendsStore.js'

const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/club-trends-padded-dupes-d61-2017-2018'
)
const PY = '2017-2018'
const DISTRICT = '61'

let cacheDir: string

async function loadRecorded(name: string): Promise<{
  recorded: ClubTrendsStoreData
  store: ClubTrendsStore
}> {
  const text = await fs.readFile(path.join(FIXTURES, `${name}.json`), 'utf-8')
  const target = ClubTrendsStore.getPath(cacheDir, PY, DISTRICT)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, text, 'utf-8')
  const store = await ClubTrendsStore.load(cacheDir, PY, DISTRICT)
  if (!store) throw new Error('store did not load')
  return { recorded: JSON.parse(text) as ClubTrendsStoreData, store }
}

beforeEach(async () => {
  cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'club-trends-2100-'))
})

afterEach(async () => {
  await fs.rm(cacheDir, { recursive: true, force: true })
})

describe('ClubTrendsStore padded duplicate keys (#2100)', () => {
  it('merges the prod shape: canonical June point + padded month-ends', async () => {
    const { recorded, store } = await loadRecorded('prod')

    expect(Object.keys(store.clubs).sort()).toEqual(['180', '348', '4856'])

    const padded = recorded.clubs['00000180']!
    const club = store.getClub('180')!
    expect(club.clubId).toBe('180')
    expect(club.membershipTrend).toEqual(padded.membershipTrend)
    expect(club.dcpGoalsTrend).toEqual(padded.dcpGoalsTrend)
    expect(club.clubName).toBe(padded.clubName)

    // A club that only exists under its padded key is re-keyed, not lost.
    const onlyPadded = store.getClub('4856')!
    expect(onlyPadded.clubId).toBe('4856')
    expect(onlyPadded.membershipTrend).toEqual(
      recorded.clubs['00004856']!.membershipTrend
    )
  })

  it('collapses the staging shape, where both keys hold the same points', async () => {
    const { recorded, store } = await loadRecorded('staging')

    expect(Object.keys(store.clubs).sort()).toEqual(['180', '348'])
    expect(store.getClub('348')).toEqual(recorded.clubs['348'])
  })

  it('keeps the canonical value when a date disagrees', async () => {
    const { recorded } = await loadRecorded('staging')
    const conflicted = structuredClone(recorded)
    conflicted.clubs['00000180']!.membershipTrend[0]!.count = 999
    const target = ClubTrendsStore.getPath(cacheDir, PY, DISTRICT)
    await fs.writeFile(target, JSON.stringify(conflicted), 'utf-8')

    const store = (await ClubTrendsStore.load(cacheDir, PY, DISTRICT))!
    expect(store.getClub('180')!.membershipTrend).toEqual(
      recorded.clubs['180']!.membershipTrend
    )
  })

  it('saves a clean store with no padded keys', async () => {
    const { store } = await loadRecorded('prod')
    await store.save(cacheDir)

    const saved = JSON.parse(
      await fs.readFile(
        ClubTrendsStore.getPath(cacheDir, PY, DISTRICT),
        'utf-8'
      )
    ) as ClubTrendsStoreData
    expect(Object.keys(saved.clubs).filter(k => /^0/.test(k))).toEqual([])
    for (const [key, entry] of Object.entries(saved.clubs)) {
      expect(entry.clubId).toBe(key)
    }
  })
})
