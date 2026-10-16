/**
 * TimeSeriesIndexWriter.recordSourceGap (#2070): a date a #1671 source gap
 * left unmeasured has no point and is listed in `sourceGapDates`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  ProgramYearIndexFileSchema,
  type ProgramYearIndexFile,
  type TimeSeriesDataPoint,
} from '@taverns-red/shared-contracts'
import { TimeSeriesIndexWriter } from '../services/TimeSeriesIndexWriter.js'

const point = (date: string, membership: number): TimeSeriesDataPoint => ({
  date,
  snapshotId: date,
  membership,
  payments: membership,
  dcpGoals: 0,
  distinguishedTotal: 0,
  clubCounts: { total: 0, thriving: 0, vulnerable: 0, interventionRequired: 0 },
})

describe('TimeSeriesIndexWriter.recordSourceGap (#2070)', () => {
  let cacheDir: string
  let writer: TimeSeriesIndexWriter

  const read = async (): Promise<ProgramYearIndexFile> =>
    ProgramYearIndexFileSchema.parse(
      JSON.parse(
        await fs.readFile(
          path.join(cacheDir, 'time-series', 'district_U', '2017-2018.json'),
          'utf-8'
        )
      )
    ) as ProgramYearIndexFile

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-source-gap-'))
    writer = new TimeSeriesIndexWriter({ cacheDir })
  })

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  it('removes the gap date point, records the date and recomputes the summary', async () => {
    await writer.writeDataPoint('U', point('2017-07-31', 0))
    await writer.writeDataPoint('U', point('2017-08-31', 0))

    expect(await writer.recordSourceGap('U', '2017-08-31')).toBe(true)
    expect(await writer.recordSourceGap('U', '2017-07-31')).toBe(true)

    const file = await read()
    expect(file.dataPoints).toEqual([])
    expect(file.sourceGapDates).toEqual(['2017-07-31', '2017-08-31'])
    expect(file.summary.totalDataPoints).toBe(0)
  })

  it('is idempotent: a second call changes nothing', async () => {
    await writer.writeDataPoint('U', point('2017-07-31', 0))
    await writer.recordSourceGap('U', '2017-07-31')
    const before = await read()

    expect(await writer.recordSourceGap('U', '2017-07-31')).toBe(false)
    expect(await read()).toEqual(before)
  })

  it('creates no file for a district without one', async () => {
    expect(await writer.recordSourceGap('U', '2017-07-31')).toBe(false)
    await expect(
      fs.access(path.join(cacheDir, 'time-series', 'district_U'))
    ).rejects.toThrow()
  })

  it('a later measured point for the date clears it from sourceGapDates', async () => {
    await writer.writeDataPoint('U', point('2017-07-31', 0))
    await writer.recordSourceGap('U', '2017-07-31')

    await writer.writeDataPoint('U', point('2017-07-31', 4210))

    const file = await read()
    expect(file.dataPoints.map(p => p.membership)).toEqual([4210])
    expect(file.sourceGapDates).toBeUndefined()
  })
})
