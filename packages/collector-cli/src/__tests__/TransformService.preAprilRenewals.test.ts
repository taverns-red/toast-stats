/**
 * Pre-April "Apr. Ren." is the snapshot's own running count (#2561).
 *
 * TI's column resets after the June close. The confirmed-Distinguished count
 * of a November snapshot must read that snapshot's own district-performance
 * rows (5 renewals), never the prior program year's June close (25), which
 * alone would confirm the club. Evidence (D61 club 3045): 2025-06-30=10,
 * 2026-06-30=9, 2026-10-15=5.
 * DCP FAQ: https://www.toastmasters.org/footer/faq/Distinguished%20Club%20Program
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { TransformService } from '../services/TransformService.js'

// Live header shapes, as in TransformService.confirmedDistinguished.test.ts.
const ALL_DISTRICTS = `"REGION","DISTRICT","DSP","Training","Market Analysis","Communication Plan","Region Advisor Visit","New Payments","April Payments","October Payments","Late Payments","Charter Payments","Total YTD Payments","Payment Base","% Payment Growth","Paid Club Base","Paid Clubs","% Club Growth","Active Clubs","Distinguished Clubs","Select Distinguished Clubs","Presidents Distinguished Clubs","Smedley Distinguished Clubs","Total Distinguished Clubs","% Distinguished Clubs"
"05","61","Y","Y","Y","Y","Y","900","2072","2073","11","41","5097","5764","-11.57%","156","157","0.64%","159","0","0","0","0","0","0%"`

// 7 goals, base 20: confirmed only when April renewals reach 20.
const CLUB_PERFORMANCE = `"District","Division","Area","Club Number","Club Name","Club Status","Mem. Base","Active Members","Net Growth","Goals Met","Club Distinguished Status"
"61","A","02","00003045","Example Toastmasters","Active","20","22","2","7",""`

function districtPerformance(aprilRenewals: string): string {
  return `"District","Division","Area","Club","Club Name","New","Late Ren.","Oct. Ren.","Apr. Ren.","Total Ren.","Total Chart","Total to Date","Distinguished Status","Charter Date/Suspend Date"
"61","A","02","00003045","Example Toastmasters","0","0","0","${aprilRenewals}","${aprilRenewals}","0","${aprilRenewals}","",""`
}

describe('TransformService — pre-April renewals are the snapshot own (#2561)', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'transform-preapril-'))
    // The prior program year's June close: 25 renewals would confirm the club.
    await writeRaw('2026-06-30', '25')
    // The pre-April snapshot under test: 5 renewals do not.
    await writeRaw('2026-11-10', '5')
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  async function writeRaw(date: string, aprilRenewals: string): Promise<void> {
    const rawCsvDir = path.join(tempDir, 'raw-csv', date)
    const d61 = path.join(rawCsvDir, 'district-61')
    await fs.mkdir(d61, { recursive: true })
    await fs.writeFile(path.join(rawCsvDir, 'all-districts.csv'), ALL_DISTRICTS)
    await fs.writeFile(path.join(d61, 'club-performance.csv'), CLUB_PERFORMANCE)
    await fs.writeFile(
      path.join(d61, 'district-performance.csv'),
      districtPerformance(aprilRenewals)
    )
  }

  async function confirmedFor(date: string): Promise<number | undefined> {
    const service = new TransformService({ cacheDir: tempDir })
    await service.transform({ date, force: true })
    const file = path.join(
      tempDir,
      'snapshots',
      date,
      'all-districts-rankings.json'
    )
    const parsed = JSON.parse(await fs.readFile(file, 'utf-8')) as {
      rankings: Array<{ districtId: string; distinguishedClubs: number }>
    }
    return parsed.rankings.find(r => r.districtId === '61')?.distinguishedClubs
  }

  it('a November snapshot counts only its own renewals (5), not the prior June close (25)', async () => {
    expect(await confirmedFor('2026-11-10')).toBe(0)
  })

  it('control: the prior June close alone would confirm the club', async () => {
    expect(await confirmedFor('2026-06-30')).toBe(1)
  })
})
