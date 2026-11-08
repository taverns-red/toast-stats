/**
 * District `distinguishedCounts.confirmed` equals the rankings'
 * `distinguishedClubs` for the same date (#2553, epic #2555).
 *
 * Both are produced from the same raw CSVs: the transform writes the
 * rankings (TI's count, or before TI recognises anyone the April-renewals
 * substitution, #304 / #2221) and the district snapshot; the analytics
 * computer then counts the snapshot's clubs with the shared rule. This test
 * runs both, end to end, and compares them.
 *
 * The D61 rows are the live rows of three clubs from raw-csv/2026-03-30 (as
 * in TransformService.confirmedDistinguished.test.ts). The recognised case
 * is the same three clubs with TI letters, and an all-districts row whose
 * tier counts agree with them.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  AnalyticsComputer,
  type DistrictStatistics,
} from '@taverns-red/analytics-core'
import { TransformService } from '../services/TransformService.js'

const ALL_DISTRICTS_HEADER =
  '"REGION","DISTRICT","DSP","Training","Market Analysis","Communication Plan","Region Advisor Visit","New Payments","April Payments","October Payments","Late Payments","Charter Payments","Total YTD Payments","Payment Base","% Payment Growth","Paid Club Base","Paid Clubs","% Club Growth","Active Clubs","Distinguished Clubs","Select Distinguished Clubs","Presidents Distinguished Clubs","Smedley Distinguished Clubs","Total Distinguished Clubs","% Distinguished Clubs"'
const D61_ROW_ZERO =
  '"05","61","Y","Y","Y","Y","Y","900","2072","2073","11","41","5097","5764","-11.57%","156","157","0.64%","159","0","0","0","0","0","0%"'
// TI recognises: 1 Distinguished + 1 Select = 2.
const D61_ROW_RECOGNISED =
  '"05","61","Y","Y","Y","Y","Y","900","2072","2073","11","41","5097","5764","-11.57%","156","157","0.64%","159","1","1","0","0","2","1.28%"'

const CLUB_HEADER =
  '"District","Division","Area","Club Number","Club Name","Club Status","CSP","Mem. Base","Active Members","Net Growth","Goals Met","Level 1s","Level 2s","Add. Level 2s","Level 3s","Level 4s, Path Completions, or DTM Awards","Add. Level 4s, Path Completions, or DTM award","New Members","Add. New Members","Off. Trained Round 1","Off. Trained Round 2","Mem. dues on time Oct","Mem. dues on time Apr","Off. List On Time","Club Distinguished Status"'

function clubPerformance(letters: [string, string, string]): string {
  return `${CLUB_HEADER}
"61","A","01","00003045","Limestone City Club","Active","Y","13","10","-3","3","0","1","0","1","1","1","1","0","2","1","1","1","1","${letters[0]}"
"61","A","02","01570163","Downtown Kingston Toastmasters","Active","Y","32","37","5","7","6","1","0","1","1","1","4","12","5","7","1","1","1","${letters[1]}"
"61","A","03","04544358","Stittsville Toastmasters Club","Active","Y","37","38","1","8","3","2","1","5","1","2","4","10","7","7","1","1","1","${letters[2]}"`
}

const DISTRICT_PERFORMANCE = `"District","Division","Area","Club","Club Name","New","Late Ren.","Oct. Ren.","Apr. Ren.","Total Ren.","Total Chart","Total to Date","Distinguished Status","Charter Date/Suspend Date"
"61","A","01","00003045","Limestone City Club","1","0","9","9","18","0","19","",""
"61","A","02","01570163","Downtown Kingston Toastmasters","16","0","30","26","56","0","72","",""
"61","A","03","04544358","Stittsville Toastmasters Club","14","0","24","38","62","0","76","",""`

describe('district distinguishedCounts.confirmed == rankings distinguishedClubs (#2553)', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dist-counts-parity-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  async function run(
    date: string,
    allDistrictsRow: string,
    letters: [string, string, string]
  ): Promise<{ rankings: number; confirmed: number | undefined }> {
    const rawCsvDir = path.join(tempDir, 'raw-csv', date)
    const d61 = path.join(rawCsvDir, 'district-61')
    await fs.mkdir(d61, { recursive: true })
    await fs.writeFile(
      path.join(rawCsvDir, 'all-districts.csv'),
      [ALL_DISTRICTS_HEADER, allDistrictsRow].join('\n')
    )
    await fs.writeFile(
      path.join(d61, 'club-performance.csv'),
      clubPerformance(letters)
    )
    await fs.writeFile(
      path.join(d61, 'district-performance.csv'),
      DISTRICT_PERFORMANCE
    )

    await new TransformService({ cacheDir: tempDir }).transform({
      date,
      force: true,
    })

    const snapshotDir = path.join(tempDir, 'snapshots', date)
    const rankingsFile = JSON.parse(
      await fs.readFile(
        path.join(snapshotDir, 'all-districts-rankings.json'),
        'utf-8'
      )
    ) as { rankings: Array<{ districtId: string; distinguishedClubs: number }> }
    const district = JSON.parse(
      await fs.readFile(path.join(snapshotDir, 'district_61.json'), 'utf-8')
    ) as { data: DistrictStatistics }

    const analytics = await new AnalyticsComputer().computeDistrictAnalytics(
      '61',
      [district.data]
    )
    return {
      rankings: rankingsFile.rankings.find(r => r.districtId === '61')!
        .distinguishedClubs,
      confirmed: analytics.districtAnalytics.distinguishedCounts?.confirmed,
    }
  }

  it('before TI recognises anyone: the April-renewals count', async () => {
    const { rankings, confirmed } = await run('2026-03-30', D61_ROW_ZERO, [
      '',
      '',
      '',
    ])
    // Downtown Kingston (7 goals, 26 renewals) and Stittsville (8 goals,
    // 38 renewals) are confirmed; Limestone City (3 goals) is not.
    expect(rankings).toBe(2)
    expect(confirmed).toBe(rankings)
  })

  it("once TI recognises clubs: TI's own count", async () => {
    const { rankings, confirmed } = await run(
      '2026-04-30',
      D61_ROW_RECOGNISED,
      ['', 'D', 'S']
    )
    expect(rankings).toBe(2)
    expect(confirmed).toBe(rankings)
  })
})
