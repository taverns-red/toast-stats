/**
 * Per-district charter cohort survival files (#2061; page #1817).
 *
 * The pipeline folds the club-district history it just built into one
 * small file per district, with the shared fold the survival page used to
 * run over all 100 shards in the browser. The real-data fixture is the
 * recorded prod history the page's own tests use (all 100 shards, trimmed
 * to the clubs whose byProgramYear names District 61 or 01 — every club a
 * D61 cohort can hold), and the committed D61 file is this fold's output
 * over it: the frontend checks that file against the in-browser fold.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { gzipSync } from 'node:zlib'
import {
  CharterCohortSurvivalFileSchema,
  ClubDistrictHistoryIndexSchema,
  ClubDistrictHistoryShardSchema,
  buildCharterCohortSurvivalFile,
  type ClubDistrictHistoryClub,
  type ClubDistrictHistoryShard,
} from '@taverns-red/shared-contracts'
import { foldCharterCohortSurvival } from '../charterCohortSurvival.js'
import type { ClubDistrictHistoryArtifact } from '../clubDistrictHistory.js'

const REPO = process.cwd()
const RECORDED_HISTORY = path.join(
  REPO,
  'frontend/src/__tests__/fixtures/club-district-history-d61-d01.recorded.json'
)
const RECORDED_D61 = path.join(
  REPO,
  'frontend/src/__tests__/fixtures/charter-cohort-survival-d61.json'
)

function recordedHistory(): ClubDistrictHistoryArtifact {
  const raw = JSON.parse(fs.readFileSync(RECORDED_HISTORY, 'utf-8')) as {
    index: unknown
    shards: Record<string, unknown>
  }
  const shards: Record<string, ClubDistrictHistoryShard> = {}
  for (const [key, shard] of Object.entries(raw.shards)) {
    shards[key] = ClubDistrictHistoryShardSchema.parse(shard)
  }
  return { index: ClubDistrictHistoryIndexSchema.parse(raw.index), shards }
}

const allClubs = (h: ClubDistrictHistoryArtifact) => {
  const clubs: Record<string, ClubDistrictHistoryClub> = {}
  for (const s of Object.values(h.shards)) Object.assign(clubs, s.clubs)
  return clubs
}

describe('foldCharterCohortSurvival (#2061)', () => {
  const history = recordedHistory()
  const files = foldCharterCohortSurvival(history)

  it('writes one schema-valid file for every district the history names', () => {
    const named = new Set<string>()
    for (const club of Object.values(allClubs(history))) {
      for (const d of Object.values(club.byProgramYear)) named.add(d)
    }
    expect(Object.keys(files).sort()).toEqual([...named].sort())
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['61', '01']))
    for (const [id, file] of Object.entries(files)) {
      expect(CharterCohortSurvivalFileSchema.parse(file), id).toEqual(file)
      expect(file.districtId).toBe(id)
    }
  })

  it('each file is the shared fold over the whole history (grouping by charter district loses nothing)', () => {
    const clubs = allClubs(history)
    for (const id of ['61', '01']) {
      expect(files[id]).toEqual(
        buildCharterCohortSurvivalFile({
          index: history.index,
          clubs,
          districtId: id,
        })
      )
    }
  })

  it('reproduces the committed D61 file', () => {
    expect(files['61']).toEqual(
      JSON.parse(fs.readFileSync(RECORDED_D61, 'utf-8'))
    )
  })

  it('is small: the D61 file is a few KB gzipped, not the 1.2 MB of shards', () => {
    const gz = gzipSync(JSON.stringify(files['61'])).length
    expect(gz).toBeLessThan(20 * 1024)
  })

  it('gives identical bytes for any shard order', () => {
    const reversed: ClubDistrictHistoryArtifact = {
      index: history.index,
      shards: Object.fromEntries(Object.entries(history.shards).reverse()),
    }
    expect(JSON.stringify(foldCharterCohortSurvival(reversed))).toBe(
      JSON.stringify(files)
    )
  })

  it('skips a district id that cannot name an object, and says so', () => {
    const shard = history.shards['77']!
    const odd: ClubDistrictHistoryArtifact = {
      index: history.index,
      shards: {
        ...history.shards,
        '77': {
          ...shard,
          clubs: {
            ...shard.clubs,
            '99977': {
              ...Object.values(shard.clubs)[0]!,
              byProgramYear: { '2020-2021': '../x' },
            },
          },
        },
      },
    }
    const skipped: string[] = []
    const out = foldCharterCohortSurvival(odd, id => skipped.push(id))
    expect(Object.keys(out)).not.toContain('../x')
    expect(skipped).toEqual(['../x'])
  })
})
