/**
 * TransformService — Leadership Excellence wiring (#1609)
 *
 * The award year counts toward its own streak, but only at the year-end
 * close (a June close, collected in July, written to {year}-06-30). Before
 * the close the district is "on track", never a recipient. Later-PY rows
 * already in the history store (a past snapshot being rebuilt) never leak
 * into the streak.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { TransformService } from '../services/TransformService.js'
import { DistrictAwardsHistoryStore } from '../services/DistrictAwardsHistoryStore.js'

// D104 on Smedley-tier metrics with every 2025-26 prerequisite met.
const ALL_DISTRICTS_CSV = `DISTRICT,REGION,Paid Clubs,Paid Club Base,% Club Growth,Total YTD Payments,Payment Base,% Payment Growth,Active Clubs,Total Distinguished Clubs,Select Distinguished Clubs,Presidents Distinguished Clubs,Smedley Distinguished Clubs,DSP,Training,Market Analysis,Communication Plan,Region Advisor Visit
104,Region 1,110,100,10%,1100,1000,10%,110,80,20,20,20,Y,Y,Y,Y,Y`

const CLUB_CSV = `Club Number,Club Name,Division,Area,Active Members,Goals Met,Club Status
1001,Alpha Club,A,1,25,5,Active`

interface LeadershipRow {
  districtId: string
  consecutiveYears: number
  qualifies: boolean
  onTrack: boolean
}

async function writeRaw(
  cacheDir: string,
  date: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const rawDir = path.join(cacheDir, 'raw-csv', date)
  await fs.mkdir(path.join(rawDir, 'district-104'), { recursive: true })
  await fs.writeFile(
    path.join(rawDir, 'metadata.json'),
    JSON.stringify(metadata)
  )
  await fs.writeFile(path.join(rawDir, 'all-districts.csv'), ALL_DISTRICTS_CSV)
  await fs.writeFile(
    path.join(rawDir, 'district-104', 'club-performance.csv'),
    CLUB_CSV
  )
}

async function seedHistory(cacheDir: string): Promise<void> {
  const store = DistrictAwardsHistoryStore.create()
  const row = (programYear: string, distinguishedTier: string) => ({
    programYear,
    distinguishedTier,
    avgClubSize: 20,
    totalMembership: 2000,
    activeClubs: 100,
    snapshotDate: `${programYear.slice(5)}-06-30`,
  })
  store.upsertYearSummary('104', row('2023-2024', 'Select'))
  store.upsertYearSummary('104', row('2024-2025', 'Smedley'))
  // Already in the live store when 2025-26 is rebuilt (#1609 bug 1).
  store.upsertYearSummary('104', row('2026-2027', 'NotDistinguished'))
  await store.save(cacheDir)
}

async function leadershipFor(
  cacheDir: string,
  snapshotDate: string
): Promise<{ row: LeadershipRow; qualifying: string[]; tier: string }> {
  const awards = JSON.parse(
    await fs.readFile(
      path.join(cacheDir, 'snapshots', snapshotDate, 'competitive-awards.json'),
      'utf-8'
    )
  )
  return {
    row: awards.leadershipExcellenceAward.allDistricts.find(
      (d: LeadershipRow) => d.districtId === '104'
    ),
    qualifying: awards.leadershipExcellenceAward.qualifyingDistricts.map(
      (d: LeadershipRow) => d.districtId
    ),
    tier: awards.distinguishedDistrict['104'].currentTier,
  }
}

describe('TransformService — Leadership Excellence (#1609)', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'transform-le-test-'))
    await seedHistory(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('at the June close, the award year completes a 3-year streak (D104 → 2025-26 recipient)', async () => {
    await writeRaw(tempDir, '2026-07-25', {
      date: '2026-07-25',
      isClosingPeriod: true,
      dataMonth: '2026-06',
    })
    const service = new TransformService({ cacheDir: tempDir })

    const result = await service.transform({ date: '2026-07-25', force: true })
    expect(result.date).toBe('2026-06-30')

    const { row, qualifying, tier } = await leadershipFor(tempDir, '2026-06-30')
    expect(tier).toBe('Smedley')
    expect(row.consecutiveYears).toBe(3)
    expect(row.qualifies).toBe(true)
    expect(row.onTrack).toBe(false)
    expect(qualifying).toEqual(['104'])
  })

  it('mid-year, the same district is on track — not a recipient', async () => {
    await writeRaw(tempDir, '2026-04-25', {
      date: '2026-04-25',
      isClosingPeriod: false,
    })
    const service = new TransformService({ cacheDir: tempDir })

    await service.transform({ date: '2026-04-25', force: true })

    const { row, qualifying } = await leadershipFor(tempDir, '2026-04-25')
    expect(row.consecutiveYears).toBe(2)
    expect(row.qualifies).toBe(false)
    expect(row.onTrack).toBe(true)
    expect(qualifying).toEqual([])
  })
})
