/**
 * TransformService — a pre-close raw must never clobber a closing snapshot (#1608)
 *
 * Incident: on 2026-09-10 a `rebuild` dispatch with dates=2026-06-30
 * transformed raw-csv/2026-06-30 ("Month of Jun, As of 06/30/2026",
 * isClosingPeriod:false) with --force and overwrote snapshots/2026-06-30,
 * which the 2026-07-26 daily run had built from TI's June close
 * (raw-csv/2026-07-25, isClosingPeriod:true, dataMonth 2026-06). The
 * collection-date guard (shouldUpdateSnapshot) only ran for closing-period
 * input and was skipped under --force, so nothing protected the month-end.
 *
 * Contract: non-closing input whose snapshot date already holds a closing
 * snapshot (isClosingPeriodData: true) is skipped — even with --force. The
 * close is strictly more authoritative for that month-end than any in-month
 * view of it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { TransformService } from '../services/TransformService.js'

const CLUB_CSV = `Club Number,Club Name,Division,Area,Active Members,Total to Date,Goals Met,Club Status
1234,Test Club One,A,1,25,30,5,Active`

const CLOSING_METADATA = {
  snapshotId: '2026-06-30',
  createdAt: '2026-07-26T09:03:05.000Z',
  schemaVersion: '1.0.0',
  calculationVersion: '1.0.0',
  status: 'success',
  configuredDistricts: ['42'],
  successfulDistricts: ['42'],
  failedDistricts: [],
  errors: [],
  processingDuration: 1,
  source: 'collector-cli',
  dataAsOfDate: '2026-06-30',
  isClosingPeriodData: true,
  collectionDate: '2026-07-25',
  logicalDate: '2026-06-30',
}

const CLOSING_DISTRICT_SENTINEL = '{"sentinel":"june-close-2026-07-25"}'

async function writeRaw(
  cacheDir: string,
  date: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const rawDir = path.join(cacheDir, 'raw-csv', date)
  await fs.mkdir(path.join(rawDir, 'district-42'), { recursive: true })
  await fs.writeFile(
    path.join(rawDir, 'metadata.json'),
    JSON.stringify(metadata)
  )
  await fs.writeFile(
    path.join(rawDir, 'district-42', 'club-performance.csv'),
    CLUB_CSV
  )
}

async function writeClosingSnapshot(cacheDir: string): Promise<string> {
  const snapDir = path.join(cacheDir, 'snapshots', '2026-06-30')
  await fs.mkdir(snapDir, { recursive: true })
  await fs.writeFile(
    path.join(snapDir, 'metadata.json'),
    JSON.stringify(CLOSING_METADATA)
  )
  await fs.writeFile(
    path.join(snapDir, 'district_42.json'),
    CLOSING_DISTRICT_SENTINEL
  )
  return snapDir
}

describe('TransformService — closing snapshot is never clobbered by pre-close data (#1608)', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'transform-clobber-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('skips a forced pre-close month-end transform when a closing snapshot exists', async () => {
    await writeRaw(tempDir, '2026-06-30', {
      date: '2026-06-30',
      isClosingPeriod: false,
    })
    const snapDir = await writeClosingSnapshot(tempDir)
    const service = new TransformService({ cacheDir: tempDir })

    const result = await service.transform({ date: '2026-06-30', force: true })

    expect(result.success).toBe(true)
    expect(result.districtsSucceeded).toEqual([])

    const metadata = JSON.parse(
      await fs.readFile(path.join(snapDir, 'metadata.json'), 'utf-8')
    ) as Record<string, unknown>
    expect(metadata['isClosingPeriodData']).toBe(true)
    expect(metadata['collectionDate']).toBe('2026-07-25')
    expect(
      await fs.readFile(path.join(snapDir, 'district_42.json'), 'utf-8')
    ).toBe(CLOSING_DISTRICT_SENTINEL)
  })

  it('still writes a pre-close month-end when no closing snapshot exists yet', async () => {
    await writeRaw(tempDir, '2026-06-30', {
      date: '2026-06-30',
      isClosingPeriod: false,
    })
    const service = new TransformService({ cacheDir: tempDir })

    const result = await service.transform({ date: '2026-06-30', force: true })

    expect(result.success).toBe(true)
    expect(result.districtsSucceeded).toEqual(['42'])
    const metadata = JSON.parse(
      await fs.readFile(
        path.join(tempDir, 'snapshots', '2026-06-30', 'metadata.json'),
        'utf-8'
      )
    ) as Record<string, unknown>
    expect(metadata['isClosingPeriodData']).toBeUndefined()
  })

  it('a forced closing-period transform still replaces the closing snapshot', async () => {
    await writeRaw(tempDir, '2026-07-25', {
      date: '2026-07-25',
      isClosingPeriod: true,
      dataMonth: '2026-06',
    })
    const snapDir = await writeClosingSnapshot(tempDir)
    const service = new TransformService({ cacheDir: tempDir })

    const result = await service.transform({ date: '2026-07-25', force: true })

    expect(result.success).toBe(true)
    expect(result.date).toBe('2026-06-30')
    expect(result.districtsSucceeded).toEqual(['42'])
    expect(
      await fs.readFile(path.join(snapDir, 'district_42.json'), 'utf-8')
    ).not.toBe(CLOSING_DISTRICT_SENTINEL)
  })
})
