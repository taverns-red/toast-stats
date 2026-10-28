/**
 * The confirmed-Distinguished ladder uses the snapshot's LOGICAL program year
 * (#2324, the #1284 / #1622 tripwire).
 *
 * The rankings read the raw CSVs of the collection date but describe the
 * logical date. TI's June close is collected in July (raw-csv/2025-07-20,
 * isClosingPeriod, dataMonth 2025-06) and written to snapshots/2025-06-30,
 * which belongs to PY 2024-2025. The calendar PY of the collection date is
 * 2025-2026, the next year.
 *
 * Today's ladders share every rung below President's, so the COUNT does not
 * yet change between those two years. The spy pins the year the ladder is
 * picked for, so a future era that moves a lower rung cannot silently use
 * the wrong one at the July boundary.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

const spy = vi.hoisted(() => ({ programYears: [] as (string | undefined)[] }))

vi.mock('@taverns-red/analytics-core', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@taverns-red/analytics-core')>()
  return {
    ...actual,
    countConfirmedDistinguishedClubs: (
      ...args: Parameters<typeof actual.countConfirmedDistinguishedClubs>
    ) => {
      spy.programYears.push(args[2])
      return actual.countConfirmedDistinguishedClubs(...args)
    },
  }
})

import { TransformService } from '../services/TransformService.js'

// Live header shapes, as in TransformService.confirmedDistinguished.test.ts.
const ALL_DISTRICTS = `"REGION","DISTRICT","DSP","Training","Market Analysis","Communication Plan","Region Advisor Visit","New Payments","April Payments","October Payments","Late Payments","Charter Payments","Total YTD Payments","Payment Base","% Payment Growth","Paid Club Base","Paid Clubs","% Club Growth","Active Clubs","Distinguished Clubs","Select Distinguished Clubs","Presidents Distinguished Clubs","Smedley Distinguished Clubs","Total Distinguished Clubs","% Distinguished Clubs"
"05","61","Y","Y","Y","Y","Y","900","2072","2073","11","41","5097","5764","-11.57%","156","157","0.64%","159","0","0","0","0","0","0%"`

const CLUB_PERFORMANCE = `"District","Division","Area","Club Number","Club Name","Club Status","Mem. Base","Active Members","Net Growth","Goals Met","Club Distinguished Status"
"61","A","02","01570163","Downtown Kingston Toastmasters","Active","32","37","5","7",""`

const DISTRICT_PERFORMANCE = `"District","Division","Area","Club","Club Name","New","Late Ren.","Oct. Ren.","Apr. Ren.","Total Ren.","Total Chart","Total to Date","Distinguished Status","Charter Date/Suspend Date"
"61","A","02","01570163","Downtown Kingston Toastmasters","16","0","30","26","56","0","72","",""`

describe('TransformService — confirmed Distinguished program year (#2324)', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'transform-cd-py-'))
    spy.programYears = []
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  async function writeRaw(date: string, metadata?: object): Promise<void> {
    const rawCsvDir = path.join(tempDir, 'raw-csv', date)
    const d61 = path.join(rawCsvDir, 'district-61')
    await fs.mkdir(d61, { recursive: true })
    if (metadata) {
      await fs.writeFile(
        path.join(rawCsvDir, 'metadata.json'),
        JSON.stringify({ date, ...metadata })
      )
    }
    await fs.writeFile(path.join(rawCsvDir, 'all-districts.csv'), ALL_DISTRICTS)
    await fs.writeFile(path.join(d61, 'club-performance.csv'), CLUB_PERFORMANCE)
    await fs.writeFile(
      path.join(d61, 'district-performance.csv'),
      DISTRICT_PERFORMANCE
    )
  }

  it('uses the closing PY for a June close collected in July', async () => {
    const date = '2025-07-20'
    await writeRaw(date, { isClosingPeriod: true, dataMonth: '2025-06' })

    const service = new TransformService({ cacheDir: tempDir })
    const result = await service.transform({ date, force: true })

    expect(result.date).toBe('2025-06-30')
    expect(spy.programYears).toEqual(['2024-2025'])
  })

  it('uses the same PY as the calendar for a mid-year date', async () => {
    const date = '2026-03-30'
    await writeRaw(date)

    const service = new TransformService({ cacheDir: tempDir })
    const result = await service.transform({ date, force: true })

    expect(result.date).toBe(date)
    expect(spy.programYears).toEqual(['2025-2026'])
  })
})
