/**
 * #2475 phase 3 — `final` on a month end's revision index. The first
 * non-closing daily after a close shows the reconciliation is over, so the
 * previous month end's index gets `final` = its last closing revision.
 * Forward only: a set `final` never moves or changes. The pipeline hydrates
 * the index from staging into a work file and uploads it when stamped.
 *
 * Fixtures are written to a temp dir; nothing touches GCS.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ReconciliationRevisionIndexSchema } from '@taverns-red/shared-contracts'
import { stampFinal } from '../services/RevisionStore.js'

const MONTH_END = '2026-10-31'
const DAILY = '2026-11-05'

let tmp: string
let snapshots: string
let indexFile: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-final-'))
  snapshots = path.join(tmp, 'snapshots')
  indexFile = path.join(tmp, 'work', 'index.json')
  fs.mkdirSync(path.dirname(indexFile), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

/** The daily's own snapshot metadata, as TransformService writes it. */
function writeDaily(date: string, closing = false): void {
  const dir = path.join(snapshots, date)
  fs.mkdirSync(dir, { recursive: true })
  const metadata: Record<string, unknown> = {
    snapshotId: date,
    createdAt: `${date}T13:05:00.000Z`,
    dataAsOfDate: date,
    successfulDistricts: ['61', 'F'],
    failedDistricts: [],
  }
  if (closing) {
    metadata['isClosingPeriodData'] = true
    metadata['collectionDate'] = date
    metadata['logicalDate'] = MONTH_END
  }
  fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify(metadata))
}

const revision = (asOf: string, closing = true) => ({
  asOf,
  collectedAt: `${asOf}T13:05:00.000Z`,
  closing,
  successfulDistricts: ['61', 'F'],
})

function writeIndex(over: Record<string, unknown> = {}): void {
  fs.writeFileSync(
    indexFile,
    JSON.stringify({
      schemaVersion: 1,
      monthEnd: MONTH_END,
      dataMonth: '2026-10',
      revisions: [
        revision(MONTH_END, false),
        revision('2026-11-01'),
        revision('2026-11-03'),
      ],
      final: null,
      ...over,
    })
  )
}

const readIndex = () =>
  ReconciliationRevisionIndexSchema.parse(
    JSON.parse(fs.readFileSync(indexFile, 'utf-8'))
  )

describe('stampFinal (#2475 phase 3)', () => {
  it('stamps the previous month end’s final with its last closing revision', async () => {
    writeDaily(DAILY)
    writeIndex()

    const r = await stampFinal({
      snapshotsDir: snapshots,
      date: DAILY,
      indexFile,
    })

    expect(r).toEqual({
      date: DAILY,
      monthEnd: MONTH_END,
      stamped: true,
      final: '2026-11-03',
      outcome: 'stamped',
      written: ['revisions/index.json'],
    })
    expect(readIndex().final).toBe('2026-11-03')
    expect(readIndex().revisions).toHaveLength(3)
  })

  it('is forward only: a final already set is never changed', async () => {
    writeDaily(DAILY)
    writeIndex({ final: '2026-11-01' })
    const before = fs.readFileSync(indexFile, 'utf-8')

    const r = await stampFinal({
      snapshotsDir: snapshots,
      date: DAILY,
      indexFile,
    })

    expect(r.stamped).toBe(false)
    expect(r.outcome).toBe('already-final')
    expect(r.final).toBe('2026-11-01')
    expect(r.written).toEqual([])
    expect(fs.readFileSync(indexFile, 'utf-8')).toBe(before)
  })

  it('is idempotent: a second run changes nothing', async () => {
    writeDaily(DAILY)
    writeIndex()
    await stampFinal({ snapshotsDir: snapshots, date: DAILY, indexFile })
    const after = fs.readFileSync(indexFile, 'utf-8')

    const r = await stampFinal({
      snapshotsDir: snapshots,
      date: DAILY,
      indexFile,
    })

    expect(r.outcome).toBe('already-final')
    expect(fs.readFileSync(indexFile, 'utf-8')).toBe(after)
  })

  it('stamps nothing when only revision 0 was recorded', async () => {
    writeDaily(DAILY)
    writeIndex({ revisions: [revision(MONTH_END, false)] })

    const r = await stampFinal({
      snapshotsDir: snapshots,
      date: DAILY,
      indexFile,
    })

    expect(r.stamped).toBe(false)
    expect(r.outcome).toBe('no-closing-revision')
    expect(readIndex().final).toBeNull()
  })

  it('takes the month end from the daily’s own date across a year end', async () => {
    writeDaily('2027-01-04')
    fs.writeFileSync(
      indexFile,
      JSON.stringify({
        schemaVersion: 1,
        monthEnd: '2026-12-31',
        dataMonth: '2026-12',
        revisions: [revision('2027-01-02')],
        final: null,
      })
    )

    const r = await stampFinal({
      snapshotsDir: snapshots,
      date: '2027-01-04',
      indexFile,
    })

    expect(r.monthEnd).toBe('2026-12-31')
    expect(readIndex().final).toBe('2027-01-02')
  })

  describe('fails closed, writing nothing', () => {
    it('on a daily that is closing data (the close is not over)', async () => {
      writeDaily(DAILY, true)
      writeIndex()
      await expect(
        stampFinal({ snapshotsDir: snapshots, date: DAILY, indexFile })
      ).rejects.toThrow(/closing/)
      expect(readIndex().final).toBeNull()
    })

    it('on a daily with no snapshot metadata', async () => {
      writeIndex()
      await expect(
        stampFinal({ snapshotsDir: snapshots, date: DAILY, indexFile })
      ).rejects.toThrow(/metadata/)
    })

    it('on an index of another month end', async () => {
      writeDaily('2026-12-02')
      writeIndex()
      await expect(
        stampFinal({ snapshotsDir: snapshots, date: '2026-12-02', indexFile })
      ).rejects.toThrow(/2026-11-30/)
      expect(readIndex().final).toBeNull()
    })

    it('on a closing revision on or after the daily (a rerun of an earlier day)', async () => {
      writeDaily('2026-11-02')
      writeIndex()
      await expect(
        stampFinal({ snapshotsDir: snapshots, date: '2026-11-02', indexFile })
      ).rejects.toThrow(/2026-11-03/)
      expect(readIndex().final).toBeNull()
    })

    it('on a malformed index', async () => {
      writeDaily(DAILY)
      fs.writeFileSync(indexFile, '{"nope":1}')
      await expect(
        stampFinal({ snapshotsDir: snapshots, date: DAILY, indexFile })
      ).rejects.toThrow(/index/)
      expect(fs.readFileSync(indexFile, 'utf-8')).toBe('{"nope":1}')
    })

    it('on a date that is not YYYY-MM-DD', async () => {
      writeIndex()
      await expect(
        stampFinal({ snapshotsDir: snapshots, date: '2026-11', indexFile })
      ).rejects.toThrow(/YYYY-MM-DD/)
    })
  })
})
