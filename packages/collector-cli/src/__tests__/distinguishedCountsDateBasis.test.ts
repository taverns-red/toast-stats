/**
 * District `distinguishedCounts.confirmed` follows the date-level "does TI
 * publish club Distinguished statuses yet" decision the rankings make (#2560,
 * follow-up to #2553).
 *
 * The rankings decide once per date, from TI's all-districts totals: any
 * district reporting Distinguished clubs means TI publishes, and every
 * district keeps TI's own count. District analytics used to decide per
 * district from its own clubs' letters, so a district with no letters while
 * TI publishes elsewhere fell back to the April-renewals count and could sit
 * above the rankings' figure.
 *
 * Synthetic case from TransformService.confirmedDistinguished.test.ts: D50
 * reports TI total 5 with no status letters on its club rows; D61 (three live
 * rows) reports 0, so its rankings figure is TI's 0. D61's clubs would
 * confirm 2 on April renewals alone.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import type { DistrictAnalytics } from '@taverns-red/analytics-core'
import { TransformService } from '../services/TransformService.js'
import { AnalyticsComputeService } from '../services/AnalyticsComputeService.js'

const DATE = '2026-03-30'

const ALL_DISTRICTS_HEADER =
  '"REGION","DISTRICT","DSP","Training","Market Analysis","Communication Plan","Region Advisor Visit","New Payments","April Payments","October Payments","Late Payments","Charter Payments","Total YTD Payments","Payment Base","% Payment Growth","Paid Club Base","Paid Clubs","% Club Growth","Active Clubs","Distinguished Clubs","Select Distinguished Clubs","Presidents Distinguished Clubs","Smedley Distinguished Clubs","Total Distinguished Clubs","% Distinguished Clubs"'
const D61_ROW =
  '"05","61","Y","Y","Y","Y","Y","900","2072","2073","11","41","5097","5764","-11.57%","156","157","0.64%","159","0","0","0","0","0","0%"'
const D50_ROW_ZERO =
  '"04","50","Y","Y","Y","Y","Y","690","1416","1749","8","61","3924","4495","-12.7%","115","115","0%","117","0","0","0","0","0","0%"'
const D50_ROW_FIVE =
  '"04","50","Y","Y","Y","Y","Y","690","1416","1749","8","61","3924","4495","-12.7%","115","115","0%","117","5","0","0","0","5","4.35%"'

const CLUB_HEADER =
  '"District","Division","Area","Club Number","Club Name","Club Status","CSP","Mem. Base","Active Members","Net Growth","Goals Met","Level 1s","Level 2s","Add. Level 2s","Level 3s","Level 4s, Path Completions, or DTM Awards","Add. Level 4s, Path Completions, or DTM award","New Members","Add. New Members","Off. Trained Round 1","Off. Trained Round 2","Mem. dues on time Oct","Mem. dues on time Apr","Off. List On Time","Club Distinguished Status"'
const PERF_HEADER =
  '"District","Division","Area","Club","Club Name","New","Late Ren.","Oct. Ren.","Apr. Ren.","Total Ren.","Total Chart","Total to Date","Distinguished Status","Charter Date/Suspend Date"'

// Live rows of three D61 clubs (raw-csv/2026-03-30): Downtown Kingston and
// Stittsville meet a rung on April renewals alone; Limestone City does not.
const D61_CLUBS = `${CLUB_HEADER}
"61","A","01","00003045","Limestone City Club","Active","Y","13","10","-3","3","0","1","0","1","1","1","1","0","2","1","1","1","1",""
"61","A","02","01570163","Downtown Kingston Toastmasters","Active","Y","32","37","5","7","6","1","0","1","1","1","4","12","5","7","1","1","1",""
"61","A","03","04544358","Stittsville Toastmasters Club","Active","Y","37","38","1","8","3","2","1","5","1","2","4","10","7","7","1","1","1",""`
const D61_PERF = `${PERF_HEADER}
"61","A","01","00003045","Limestone City Club","1","0","9","9","18","0","19","",""
"61","A","02","01570163","Downtown Kingston Toastmasters","16","0","30","26","56","0","72","",""
"61","A","03","04544358","Stittsville Toastmasters Club","14","0","24","38","62","0","76","",""`

// One synthetic D50 club, no status letter, below every rung on renewals.
const D50_CLUBS = `${CLUB_HEADER}
"50","A","01","00005001","Example Club","Active","Y","20","22","2","6","0","1","0","1","1","1","1","0","2","1","1","1","1",""`
const D50_PERF = `${PERF_HEADER}
"50","A","01","00005001","Example Club","2","0","15","5","20","0","22","",""`

describe('district confirmed Distinguished follows the date-level decision (#2560)', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), '2560-date-basis-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  async function writeRawDistrict(
    id: string,
    clubs: string,
    perf: string
  ): Promise<void> {
    const dir = path.join(tempDir, 'raw-csv', DATE, `district-${id}`)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'club-performance.csv'), clubs)
    await fs.writeFile(path.join(dir, 'district-performance.csv'), perf)
  }

  async function run(
    d50Row: string
  ): Promise<{ rankings: number; confirmed: number | undefined }> {
    const rawCsvDir = path.join(tempDir, 'raw-csv', DATE)
    await fs.mkdir(rawCsvDir, { recursive: true })
    await fs.writeFile(
      path.join(rawCsvDir, 'all-districts.csv'),
      [ALL_DISTRICTS_HEADER, D61_ROW, d50Row].join('\n')
    )
    await writeRawDistrict('61', D61_CLUBS, D61_PERF)
    await writeRawDistrict('50', D50_CLUBS, D50_PERF)

    await new TransformService({ cacheDir: tempDir }).transform({
      date: DATE,
      force: true,
    })

    const rankingsFile = JSON.parse(
      await fs.readFile(
        path.join(tempDir, 'snapshots', DATE, 'all-districts-rankings.json'),
        'utf-8'
      )
    ) as { rankings: Array<{ districtId: string; distinguishedClubs: number }> }

    const result = await new AnalyticsComputeService({
      cacheDir: tempDir,
    }).computeDistrictAnalytics(DATE, '61', { force: true })
    expect(result.success).toBe(true)

    const analytics = JSON.parse(
      await fs.readFile(
        path.join(
          tempDir,
          'snapshots',
          DATE,
          'analytics',
          'district_61_analytics.json'
        ),
        'utf-8'
      )
    ) as { data: DistrictAnalytics }

    return {
      rankings: rankingsFile.rankings.find(r => r.districtId === '61')!
        .distinguishedClubs,
      confirmed: analytics.data.distinguishedCounts?.confirmed,
    }
  }

  it("TI publishes elsewhere (D50 total 5): D61 keeps TI's count, as the rankings do", async () => {
    const { rankings, confirmed } = await run(D50_ROW_FIVE)
    expect(rankings).toBe(0)
    expect(confirmed).toBe(rankings)
  })

  it('TI publishes nowhere: the April-renewals count, as the rankings', async () => {
    const { rankings, confirmed } = await run(D50_ROW_ZERO)
    expect(rankings).toBe(2)
    expect(confirmed).toBe(rankings)
  })
})
