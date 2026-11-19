/**
 * TransformService — March-close baseline join (#1614)
 *
 * From April 1 to June 30 the President's Membership Retention estimate
 * needs each district's March 31 new and charter payments. The transform
 * reads them from `baselines/march-close/{Y}-03-31.json` (Y from the
 * snapshot's LOGICAL date) and joins them onto the rankings rows. A missing
 * or broken baseline leaves the fields absent (the award reads
 * baseline-missing, never zero) and never fails the transform.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { gzipSync } from 'node:zlib'
import type { Logger } from '@taverns-red/analytics-core'
import { TransformService } from '../services/TransformService.js'

const HEADER =
  'DISTRICT,REGION,Paid Clubs,Paid Club Base,% Club Growth,Total YTD Payments,Payment Base,% Payment Growth,Active Clubs,Total Distinguished Clubs,Select Distinguished Clubs,Presidents Distinguished Clubs,New Payments,April Payments,October Payments,Late Payments,Charter Payments'

// April renewals / (October + late + March new + March charter):
//   D104: 700 / (600 + 50 + 200 + 50) = 77.8%
//   F:    400 / (400 + 20 + 60 + 20) = 80.0%  (F is a real district)
//   U holds clubs in no district and is never ranked.
const ALL_DISTRICTS_CSV = `${HEADER}
104,Region 1,110,100,10%,1100,1000,10%,110,40,10,5,260,700,600,50,60
F,Region 14,50,48,4%,520,500,4%,50,20,5,2,90,400,400,20,30
U,,10,10,0%,100,100,0%,10,2,0,0,10,50,50,0,0`

const CLUB_CSV = `Club Number,Club Name,Division,Area,Active Members,Goals Met,Club Status
1001,Alpha Club,A,1,25,5,Active`

function baselineRow(
  districtId: string,
  newPayments: number,
  charterPayments: number
): Record<string, unknown> {
  return {
    districtId,
    districtName: districtId,
    region: '1',
    paidClubs: 100,
    paidClubBase: 100,
    clubGrowthPercent: 0,
    totalPayments: 1000,
    paymentBase: 1000,
    paymentGrowthPercent: 0,
    activeClubs: 100,
    distinguishedClubs: 10,
    selectDistinguished: 0,
    presidentsDistinguished: 0,
    distinguishedPercent: 10,
    clubsRank: 1,
    paymentsRank: 1,
    distinguishedRank: 1,
    aggregateScore: 100,
    overallRank: 1,
    newPayments,
    aprilPayments: 0,
    octoberPayments: 500,
    latePayments: 10,
    charterPayments,
  }
}

/**
 * The real 2026-03-31 file was collected during March closing: its
 * snapshotId and sourceCsvDate are 2026-04-07, the collection date (#1614
 * review note 1). The join must still accept it.
 */
function baselineFile(): Record<string, unknown> {
  return {
    metadata: {
      snapshotId: '2026-04-07',
      calculatedAt: '2026-10-27T11:26:59.869Z',
      schemaVersion: '1.0.0',
      calculationVersion: '1.0.0',
      rankingVersion: '2.0',
      sourceCsvDate: '2026-04-07',
      csvFetchedAt: '2026-10-27T11:26:59.869Z',
      totalDistricts: 3,
      fromCache: false,
    },
    rankings: [
      baselineRow('104', 200, 50),
      baselineRow('F', 60, 20),
      baselineRow('U', 5, 0),
    ],
  }
}

async function writeRaw(
  cacheDir: string,
  date: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const rawDir = path.join(cacheDir, 'raw-csv', date)
  for (const id of ['104', 'F', 'U']) {
    await fs.mkdir(path.join(rawDir, `district-${id}`), { recursive: true })
    await fs.writeFile(
      path.join(rawDir, `district-${id}`, 'club-performance.csv'),
      CLUB_CSV
    )
  }
  await fs.writeFile(
    path.join(rawDir, 'metadata.json'),
    JSON.stringify(metadata)
  )
  await fs.writeFile(path.join(rawDir, 'all-districts.csv'), ALL_DISTRICTS_CSV)
}

async function writeBaseline(
  cacheDir: string,
  name: string,
  content: string | Buffer
): Promise<void> {
  const dir = path.join(cacheDir, 'baselines', 'march-close')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, name), content)
}

interface Row {
  districtId: string
  marchCloseNewPayments?: number
  marchCloseCharterPayments?: number
}

async function readJson(
  cacheDir: string,
  date: string,
  file: string
): Promise<Record<string, unknown>> {
  return JSON.parse(
    await fs.readFile(path.join(cacheDir, 'snapshots', date, file), 'utf-8')
  ) as Record<string, unknown>
}

async function rowsFor(cacheDir: string, date: string): Promise<Row[]> {
  const data = await readJson(cacheDir, date, 'all-districts-rankings.json')
  return data['rankings'] as Row[]
}

interface Award {
  status: string
  baselineDate?: string
  standings: Array<{
    districtId: string
    rank: number
    isWinner: boolean
    retained: number
    base: number
  }>
}

async function awardFor(cacheDir: string, date: string): Promise<Award> {
  const data = await readJson(cacheDir, date, 'competitive-awards.json')
  return data['membershipRetentionAward'] as Award
}

function capturingLogger(): { logger: Logger; warnings: string[] } {
  const warnings: string[] = []
  const logger: Logger = {
    info: () => {},
    debug: () => {},
    warn: (message: string) => {
      warnings.push(message)
    },
    error: (message: string) => {
      warnings.push(message)
    },
  }
  return { logger, warnings }
}

describe('TransformService — March-close baseline join (#1614)', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'transform-mc-test-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('joins March-close new and charter payments by district inside the window', async () => {
    await writeBaseline(
      tempDir,
      '2026-03-31.json',
      JSON.stringify(baselineFile())
    )
    await writeRaw(tempDir, '2026-04-25', {
      date: '2026-04-25',
      isClosingPeriod: false,
    })

    await new TransformService({ cacheDir: tempDir }).transform({
      date: '2026-04-25',
      force: true,
    })

    const rows = await rowsFor(tempDir, '2026-04-25')
    const d104 = rows.find(r => r.districtId === '104')
    expect(d104?.marchCloseNewPayments).toBe(200)
    expect(d104?.marchCloseCharterPayments).toBe(50)
    const f = rows.find(r => r.districtId === 'F')
    expect(f?.marchCloseNewPayments).toBe(60)
    expect(f?.marchCloseCharterPayments).toBe(20)
  })

  it('writes the in-progress award: F ranked first, D104 second, U left out', async () => {
    await writeBaseline(
      tempDir,
      '2026-03-31.json',
      JSON.stringify(baselineFile())
    )
    await writeRaw(tempDir, '2026-04-25', {
      date: '2026-04-25',
      isClosingPeriod: false,
    })

    await new TransformService({ cacheDir: tempDir }).transform({
      date: '2026-04-25',
      force: true,
    })

    const award = await awardFor(tempDir, '2026-04-25')
    expect(award.status).toBe('in-progress')
    expect(award.baselineDate).toBe('2026-03-31')
    expect(award.standings.map(s => [s.districtId, s.rank])).toEqual([
      ['F', 1],
      ['104', 2],
    ])
    expect(award.standings[1]).toMatchObject({ retained: 700, base: 900 })

    const awards = await readJson(
      tempDir,
      '2026-04-25',
      'competitive-awards.json'
    )
    const byDistrict = awards['byDistrict'] as Record<
      string,
      Record<string, unknown>
    >
    expect(byDistrict['104']?.['membershipRetentionRank']).toBe(2)
    expect(byDistrict['U']?.['membershipRetentionRank']).toBeUndefined()
  })

  it('a June close collected in July uses that PY’s March close and is final', async () => {
    await writeBaseline(
      tempDir,
      '2026-03-31.json',
      JSON.stringify(baselineFile())
    )
    await writeRaw(tempDir, '2026-07-25', {
      date: '2026-07-25',
      isClosingPeriod: true,
      dataMonth: '2026-06',
    })

    const result = await new TransformService({ cacheDir: tempDir }).transform({
      date: '2026-07-25',
      force: true,
    })
    expect(result.date).toBe('2026-06-30')

    const d104 = (await rowsFor(tempDir, '2026-06-30')).find(
      r => r.districtId === '104'
    )
    expect(d104?.marchCloseNewPayments).toBe(200)
    const award = await awardFor(tempDir, '2026-06-30')
    expect(award.status).toBe('final')
    expect(award.baselineDate).toBe('2026-03-31')
  })

  it('the March close itself, collected in April, is outside the window', async () => {
    await writeBaseline(
      tempDir,
      '2026-03-31.json',
      JSON.stringify(baselineFile())
    )
    await writeRaw(tempDir, '2026-04-07', {
      date: '2026-04-07',
      isClosingPeriod: true,
      dataMonth: '2026-03',
    })

    const result = await new TransformService({ cacheDir: tempDir }).transform({
      date: '2026-04-07',
      force: true,
    })
    expect(result.date).toBe('2026-03-31')

    const d104 = (await rowsFor(tempDir, '2026-03-31')).find(
      r => r.districtId === '104'
    )
    expect(d104).toBeDefined()
    expect(d104).not.toHaveProperty('marchCloseNewPayments')
    expect(d104).not.toHaveProperty('marchCloseCharterPayments')
    expect((await awardFor(tempDir, '2026-03-31')).status).toBe('not-started')
  })

  it('a missing baseline leaves the fields absent, logs, and the award reads baseline-missing', async () => {
    await writeRaw(tempDir, '2026-05-15', {
      date: '2026-05-15',
      isClosingPeriod: false,
    })
    const { logger, warnings } = capturingLogger()

    const result = await new TransformService({
      cacheDir: tempDir,
      logger,
    }).transform({ date: '2026-05-15', force: true })
    expect(result.success).toBe(true)

    const d104 = (await rowsFor(tempDir, '2026-05-15')).find(
      r => r.districtId === '104'
    )
    expect(d104).not.toHaveProperty('marchCloseNewPayments')
    expect(d104).not.toHaveProperty('marchCloseCharterPayments')
    const award = await awardFor(tempDir, '2026-05-15')
    expect(award.status).toBe('baseline-missing')
    expect(award.standings).toEqual([])
    expect(warnings.some(w => /march.close baseline/i.test(w))).toBe(true)
  })

  it('a broken baseline (bad JSON) leaves the fields absent without failing', async () => {
    await writeBaseline(tempDir, '2026-03-31.json', '{"metadata": ')
    await writeRaw(tempDir, '2026-05-15', {
      date: '2026-05-15',
      isClosingPeriod: false,
    })
    const { logger, warnings } = capturingLogger()

    const result = await new TransformService({
      cacheDir: tempDir,
      logger,
    }).transform({ date: '2026-05-15', force: true })
    expect(result.success).toBe(true)

    const d104 = (await rowsFor(tempDir, '2026-05-15')).find(
      r => r.districtId === '104'
    )
    expect(d104).not.toHaveProperty('marchCloseNewPayments')
    expect((await awardFor(tempDir, '2026-05-15')).status).toBe(
      'baseline-missing'
    )
    expect(warnings.some(w => /march.close baseline/i.test(w))).toBe(true)
  })

  it('a baseline that fails the rankings schema leaves the fields absent', async () => {
    const bad = baselineFile()
    ;(bad['rankings'] as Array<Record<string, unknown>>)[0]!['newPayments'] =
      'two hundred'
    await writeBaseline(tempDir, '2026-03-31.json', JSON.stringify(bad))
    await writeRaw(tempDir, '2026-05-15', {
      date: '2026-05-15',
      isClosingPeriod: false,
    })

    const result = await new TransformService({ cacheDir: tempDir }).transform({
      date: '2026-05-15',
      force: true,
    })
    expect(result.success).toBe(true)

    const rows = await rowsFor(tempDir, '2026-05-15')
    for (const r of rows) {
      expect(r).not.toHaveProperty('marchCloseNewPayments')
    }
  })

  it('reads a baseline copied with its gzip Content-Encoding still applied', async () => {
    await writeBaseline(
      tempDir,
      '2026-03-31.json',
      gzipSync(JSON.stringify(baselineFile()))
    )
    await writeRaw(tempDir, '2026-04-25', {
      date: '2026-04-25',
      isClosingPeriod: false,
    })

    await new TransformService({ cacheDir: tempDir }).transform({
      date: '2026-04-25',
      force: true,
    })

    const d104 = (await rowsFor(tempDir, '2026-04-25')).find(
      r => r.districtId === '104'
    )
    expect(d104?.marchCloseNewPayments).toBe(200)
  })

  it('never uses another year’s March close', async () => {
    // Only the 2025 baseline exists; a 2026 date must not read it.
    await writeBaseline(
      tempDir,
      '2025-03-31.json',
      JSON.stringify(baselineFile())
    )
    await writeRaw(tempDir, '2026-04-25', {
      date: '2026-04-25',
      isClosingPeriod: false,
    })

    await new TransformService({ cacheDir: tempDir }).transform({
      date: '2026-04-25',
      force: true,
    })

    const d104 = (await rowsFor(tempDir, '2026-04-25')).find(
      r => r.districtId === '104'
    )
    expect(d104).not.toHaveProperty('marchCloseNewPayments')
    expect((await awardFor(tempDir, '2026-04-25')).status).toBe(
      'baseline-missing'
    )
  })
})
