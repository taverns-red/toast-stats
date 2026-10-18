/**
 * Closed-club name index (#2062; follow-up to #1806 / PR #2060).
 *
 * `club-index.json` is the current roster, so a closed club is searchable
 * only by number (its history shard). This index lists every club the
 * club-district history has as closed — name, last district, closed program
 * year, last sighting — so omni-search can find one by name.
 *
 * Fixtures are the RECORDED club-race stores the history fold is tested
 * with (see clubDistrictHistory.test.ts): of their six clubs, 368 (District
 * 123, absent from 2026-27) and 699 (District 05, retired in 2026) are
 * closed; the other four are still seen on the history's asOf.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  ClosedClubNameIndexSchema,
  ClubRaceStoreSchema,
  findClubContactField,
  type ClosedClubNameIndex,
  type ClubRaceStoreData,
} from '@taverns-red/shared-contracts'
import { foldClubDistrictHistory } from '../clubDistrictHistory.js'
import { buildClosedClubNameIndex } from '../closedClubNames.js'

const FIXTURES = path.resolve(__dirname, 'fixtures/identity-history/club-race')
const PYS = ['2017-2018', '2025-2026', '2026-2027']

function loadStores(): ClubRaceStoreData[] {
  return PYS.map(py =>
    ClubRaceStoreSchema.parse(
      JSON.parse(
        fs.readFileSync(path.join(FIXTURES, py, 'first-reached.json'), 'utf-8')
      )
    )
  )
}

describe('buildClosedClubNameIndex — recorded club-race stores', () => {
  let index: ClosedClubNameIndex
  beforeAll(() => {
    index = buildClosedClubNameIndex(foldClubDistrictHistory(loadStores()))
  })

  it('satisfies the shared contract and carries no contact field', () => {
    expect(() => ClosedClubNameIndexSchema.parse(index)).not.toThrow()
    expect(findClubContactField(index)).toBeNull()
  })

  it('lists only the closed clubs, under their closed PY and last district', () => {
    expect(index.asOf).toBe('2026-10-10')
    expect(index.totalClubs).toBe(2)
    expect(index.programYears).toEqual({
      '2025-2026': {
        '05': [['699', expect.any(String), expect.any(String)]],
        '123': [['368', expect.any(String), expect.any(String)]],
      },
    })
  })

  it('keeps the name as published and the last sighting date', () => {
    const [id, name, lastSeen] = index.programYears['2025-2026']!['123']![0]!
    expect(id).toBe('368')
    expect(name.length).toBeGreaterThan(0)
    expect(lastSeen).toMatch(/^2026-0[1-6]-\d{2}$/)
  })

  it('omits every club still seen on asOf', () => {
    const ids = Object.values(index.programYears)
      .flatMap(byDistrict => Object.values(byDistrict))
      .flat()
      .map(row => row[0])
    for (const open of ['977', '3045', '7', '2']) {
      expect(ids).not.toContain(open)
    }
  })

  it('is byte-identical for any input store order', () => {
    const a = JSON.stringify(
      buildClosedClubNameIndex(foldClubDistrictHistory(loadStores()))
    )
    const b = JSON.stringify(
      buildClosedClubNameIndex(
        foldClubDistrictHistory([...loadStores()].reverse())
      )
    )
    expect(a).toBe(b)
  })
})

describe('ClosedClubNameIndexSchema', () => {
  const valid = {
    _format: { version: '1.0.0', type: 'closed-club-name-index' },
    asOf: '2026-10-15',
    totalClubs: 1,
    programYears: {
      '2020-2021': { '100': [['200', 'Club 200', '2021-06-30']] },
    },
  }

  it('accepts a compact index', () => {
    expect(ClosedClubNameIndexSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a row with an extra (e.g. contact) column', () => {
    const bad = structuredClone(valid) as unknown as {
      programYears: Record<string, Record<string, unknown[][]>>
    }
    bad.programYears['2020-2021']!['100']![0]!.push('club@example.org')
    expect(ClosedClubNameIndexSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a malformed program year key', () => {
    const bad = {
      ...valid,
      programYears: { '2020': valid.programYears['2020-2021'] },
    }
    expect(ClosedClubNameIndexSchema.safeParse(bad).success).toBe(false)
  })
})
