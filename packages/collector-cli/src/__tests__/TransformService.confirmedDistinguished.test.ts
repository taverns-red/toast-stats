/**
 * Confirmed-Distinguished count in the rankings (#304, #2221).
 *
 * Before TI recognises Distinguished clubs every district reports 0, and the
 * rankings substitute the count of clubs whose APRIL RENEWALS alone meet a
 * Distinguished rung (#296 `getConfirmedDistinguishedLevel`). That count of
 * renewals is district-performance.csv "Apr. Ren." — NOT club-performance
 * "Mem. dues on time Apr", which is TI's 0/1 per-club on-time flag (#2221).
 *
 * The rows below are the literal live rows of three D61 clubs and the D61/D50
 * all-districts rows from raw-csv/2026-03-30 (prod bucket, read 2026-10-21):
 * every district reported 0 Distinguished that day.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { TransformService } from '../services/TransformService.js'

const DATE = '2026-03-30'

const ALL_DISTRICTS_HEADER =
  '"REGION","DISTRICT","DSP","Training","Market Analysis","Communication Plan","Region Advisor Visit","New Payments","April Payments","October Payments","Late Payments","Charter Payments","Total YTD Payments","Payment Base","% Payment Growth","Paid Club Base","Paid Clubs","% Club Growth","Active Clubs","Distinguished Clubs","Select Distinguished Clubs","Presidents Distinguished Clubs","Smedley Distinguished Clubs","Total Distinguished Clubs","% Distinguished Clubs"'
const D61_ROW =
  '"05","61","Y","Y","Y","Y","Y","900","2072","2073","11","41","5097","5764","-11.57%","156","157","0.64%","159","0","0","0","0","0","0%"'
const D50_ROW_ZERO =
  '"04","50","Y","Y","Y","Y","Y","690","1416","1749","8","61","3924","4495","-12.7%","115","115","0%","117","0","0","0","0","0","0%"'
// The same D50 row with TI reporting 5 Distinguished clubs (post-recognition).
const D50_ROW_FIVE =
  '"04","50","Y","Y","Y","Y","Y","690","1416","1749","8","61","3924","4495","-12.7%","115","115","0%","117","5","0","0","0","5","4.35%"'

const CLUB_PERFORMANCE = `"District","Division","Area","Club Number","Club Name","Club Status","CSP","Mem. Base","Active Members","Net Growth","Goals Met","Level 1s","Level 2s","Add. Level 2s","Level 3s","Level 4s, Path Completions, or DTM Awards","Add. Level 4s, Path Completions, or DTM award","New Members","Add. New Members","Off. Trained Round 1","Off. Trained Round 2","Mem. dues on time Oct","Mem. dues on time Apr","Off. List On Time","Club Distinguished Status"
"61","A","01","00003045","Limestone City Club","Active","Y","13","10","-3","3","0","1","0","1","1","1","1","0","2","1","1","1","1",""
"61","A","02","01570163","Downtown Kingston Toastmasters","Active","Y","32","37","5","7","6","1","0","1","1","1","4","12","5","7","1","1","1",""
"61","A","03","04544358","Stittsville Toastmasters Club","Active","Y","37","38","1","8","3","2","1","5","1","2","4","10","7","7","1","1","1",""`

const DISTRICT_PERFORMANCE = `"District","Division","Area","Club","Club Name","New","Late Ren.","Oct. Ren.","Apr. Ren.","Total Ren.","Total Chart","Total to Date","Distinguished Status","Charter Date/Suspend Date"
"61","A","01","00003045","Limestone City Club","1","0","9","9","18","0","19","",""
"61","A","02","01570163","Downtown Kingston Toastmasters","16","0","30","26","56","0","72","",""
"61","A","03","04544358","Stittsville Toastmasters Club","14","0","24","38","62","0","76","",""`

interface RankingRow {
  districtId: string
  distinguishedClubs: number
  distinguishedPercent: number
}

describe('TransformService — confirmed Distinguished reads April renewals (#2221)', () => {
  let tempDir: string
  let service: TransformService

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'transform-confirmed-dist-')
    )
    service = new TransformService({ cacheDir: tempDir })
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  async function writeDate(allDistrictsRows: string[]): Promise<void> {
    const rawCsvDir = path.join(tempDir, 'raw-csv', DATE)
    const d61 = path.join(rawCsvDir, 'district-61')
    await fs.mkdir(d61, { recursive: true })
    await fs.writeFile(
      path.join(rawCsvDir, 'all-districts.csv'),
      [ALL_DISTRICTS_HEADER, ...allDistrictsRows].join('\n')
    )
    await fs.writeFile(path.join(d61, 'club-performance.csv'), CLUB_PERFORMANCE)
    await fs.writeFile(
      path.join(d61, 'district-performance.csv'),
      DISTRICT_PERFORMANCE
    )
    // D50 needs per-district input too (#1756). One synthetic club in the
    // live header shape, below every rung on April renewals.
    const d50 = path.join(rawCsvDir, 'district-50')
    await fs.mkdir(d50, { recursive: true })
    await fs.writeFile(
      path.join(d50, 'club-performance.csv'),
      `${CLUB_PERFORMANCE.split('\n')[0]}
"50","A","01","00005001","Example Club","Active","Y","20","22","2","6","0","1","0","1","1","1","1","0","2","1","1","1","1",""`
    )
    await fs.writeFile(
      path.join(d50, 'district-performance.csv'),
      `${DISTRICT_PERFORMANCE.split('\n')[0]}
"50","A","01","00005001","Example Club","2","0","15","5","20","0","22","",""`
    )
  }

  async function readRankings(): Promise<Map<string, RankingRow>> {
    const file = path.join(
      tempDir,
      'snapshots',
      DATE,
      'all-districts-rankings.json'
    )
    const parsed = JSON.parse(await fs.readFile(file, 'utf-8')) as {
      rankings: RankingRow[]
    }
    return new Map(parsed.rankings.map(r => [r.districtId, r]))
  }

  it('counts clubs whose April renewal COUNT meets a rung, not the 0/1 on-time flag', async () => {
    await writeDate([D61_ROW, D50_ROW_ZERO])
    await service.transform({ date: DATE, force: true })
    const rankings = await readRankings()

    // Downtown Kingston: 7 goals, 26 April renewals (>= 20) → confirmed.
    // Stittsville: 8 goals, 38 April renewals → confirmed.
    // Limestone City: 3 goals → not Distinguished at any membership.
    // All three carry "Mem. dues on time Apr" = 1, which can never reach 20.
    expect(rankings.get('61')?.distinguishedClubs).toBe(2)
  })

  it('divides the confirmed count by Paid Club Base, not Active Clubs (#2224)', async () => {
    await writeDate([D61_ROW, D50_ROW_ZERO])
    await service.transform({ date: DATE, force: true })
    const rankings = await readRankings()

    // TI DDP Item 1490: % Distinguished is over the PY-start Paid Club Base
    // (D61: 156), the same divisor TI's own figure uses (#537). Active Clubs
    // (159) gives 1.258%, not 1.282%.
    expect(rankings.get('61')?.distinguishedPercent).toBeCloseTo(
      (2 / 156) * 100,
      6
    )
  })

  it('leaves TI counts untouched when any district reports Distinguished clubs', async () => {
    await writeDate([D61_ROW, D50_ROW_FIVE])
    await service.transform({ date: DATE, force: true })
    const rankings = await readRankings()

    expect(rankings.get('50')?.distinguishedClubs).toBe(5)
    expect(rankings.get('61')?.distinguishedClubs).toBe(0)
    // The override does not run, so TI's count stays over the same base.
    expect(rankings.get('50')?.distinguishedPercent).toBeCloseTo(
      (5 / 115) * 100,
      6
    )
    expect(rankings.get('61')?.distinguishedPercent).toBe(0)
  })
})
