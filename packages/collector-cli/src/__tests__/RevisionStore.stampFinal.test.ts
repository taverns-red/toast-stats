/**
 * #2475 phase 3 — `final` on a month end's revision index. The first
 * non-closing daily after a close shows the reconciliation is over, so the
 * previous month end's index gets `final` = its last closing revision.
 * Forward only: a set `final` never moves or changes. The pipeline hydrates
 * the index from staging into a work file and uploads it when stamped.
 *
 * Judged against prod's index too (review of PR #3070): staging alone
 * would read `already-final` forever after a held promotion, and prod
 * must hold every revision the index names before the index is sent.
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
let prodIndexFile: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-final-'))
  snapshots = path.join(tmp, 'snapshots')
  indexFile = path.join(tmp, 'work', 'index.json')
  prodIndexFile = path.join(tmp, 'work', 'prod-index.json')
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

function indexBody(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
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
}

/**
 * Staging's index. Prod's mirrors it (final null) unless the test says
 * otherwise: the closing dailies promoted, the stamp has not.
 */
function writeIndex(over: Record<string, unknown> = {}): void {
  fs.writeFileSync(indexFile, indexBody(over))
  if (!fs.existsSync(prodIndexFile)) {
    fs.writeFileSync(prodIndexFile, indexBody({ ...over, final: null }))
  }
}

/** Prod's index, as the pipeline reads it (read-only). */
function writeProdIndex(over: Record<string, unknown> = {}): void {
  fs.writeFileSync(prodIndexFile, indexBody(over))
}

/** The options the pipeline passes; built first, then handed over. */
function stamp(date = DAILY) {
  const opts = { snapshotsDir: snapshots, date, indexFile, prodIndexFile }
  return stampFinal(opts)
}

const readIndex = () =>
  ReconciliationRevisionIndexSchema.parse(
    JSON.parse(fs.readFileSync(indexFile, 'utf-8'))
  )

describe('stampFinal (#2475 phase 3)', () => {
  it('stamps the previous month end’s final with its last closing revision', async () => {
    writeDaily(DAILY)
    writeIndex()

    const r = await stamp()

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

  it('is forward only: a final already set in prod is never changed', async () => {
    writeDaily(DAILY)
    writeProdIndex({ final: '2026-11-01' })
    writeIndex({ final: '2026-11-01' })
    const before = fs.readFileSync(indexFile, 'utf-8')

    const r = await stamp()

    expect(r.stamped).toBe(false)
    expect(r.outcome).toBe('already-final')
    expect(r.final).toBe('2026-11-01')
    expect(r.written).toEqual([])
    expect(fs.readFileSync(indexFile, 'utf-8')).toBe(before)
  })

  it('is idempotent: a second run after the stamp promoted changes nothing', async () => {
    writeDaily(DAILY)
    writeIndex()
    await stamp()
    fs.copyFileSync(indexFile, prodIndexFile)
    const after = fs.readFileSync(indexFile, 'utf-8')

    const r = await stamp()

    expect(r.outcome).toBe('already-final')
    expect(fs.readFileSync(indexFile, 'utf-8')).toBe(after)
  })

  it('stamps nothing when only revision 0 was recorded', async () => {
    writeDaily(DAILY)
    writeIndex({ revisions: [revision(MONTH_END, false)] })

    const r = await stamp()

    expect(r.stamped).toBe(false)
    expect(r.outcome).toBe('no-closing-revision')
    expect(readIndex().final).toBeNull()
  })

  it('takes the month end from the daily’s own date across a year end', async () => {
    writeDaily('2027-01-04')
    const december = JSON.stringify({
      schemaVersion: 1,
      monthEnd: '2026-12-31',
      dataMonth: '2026-12',
      revisions: [revision('2027-01-02')],
      final: null,
    })
    fs.writeFileSync(indexFile, december)
    fs.writeFileSync(prodIndexFile, december)

    const r = await stamp('2027-01-04')

    expect(r.monthEnd).toBe('2026-12-31')
    expect(readIndex().final).toBe('2027-01-02')
  })

  describe('judged against prod’s index (review of PR #3070)', () => {
    it('sends staging’s final again when prod’s index is still not final (a held promotion)', async () => {
      writeDaily(DAILY)
      writeProdIndex()
      writeIndex({ final: '2026-11-03' })
      const before = fs.readFileSync(indexFile, 'utf-8')

      const r = await stamp()

      expect(r).toEqual({
        date: DAILY,
        monthEnd: MONTH_END,
        stamped: true,
        final: '2026-11-03',
        outcome: 'resent',
        written: ['revisions/index.json'],
      })
      expect(fs.readFileSync(indexFile, 'utf-8')).toBe(before)
    })

    it('waits while prod lacks a revision staging’s index names (a held close)', async () => {
      writeDaily(DAILY)
      writeProdIndex({
        revisions: [revision(MONTH_END, false), revision('2026-11-01')],
      })
      writeIndex()
      const before = fs.readFileSync(indexFile, 'utf-8')

      const r = await stamp()

      expect(r.stamped).toBe(false)
      expect(r.outcome).toBe('prod-behind')
      expect(r.final).toBeNull()
      expect(r.written).toEqual([])
      expect(fs.readFileSync(indexFile, 'utf-8')).toBe(before)
    })

    it('waits while prod has no index for the month end at all', async () => {
      writeDaily(DAILY)
      writeIndex()
      fs.rmSync(prodIndexFile)

      const r = await stamp()

      expect(r.stamped).toBe(false)
      expect(r.outcome).toBe('prod-behind')
      expect(readIndex().final).toBeNull()
    })

    it('fails closed on a prod index of another month end', async () => {
      writeDaily(DAILY)
      writeProdIndex({
        monthEnd: '2026-09-30',
        dataMonth: '2026-09',
        revisions: [revision('2026-09-30', false), revision('2026-10-02')],
      })
      writeIndex()
      await expect(stamp()).rejects.toThrow(/2026-09-30/)
      expect(readIndex().final).toBeNull()
    })
  })

  describe('fails closed, writing nothing', () => {
    it('on a daily that is closing data (the close is not over)', async () => {
      writeDaily(DAILY, true)
      writeIndex()
      await expect(stamp()).rejects.toThrow(/closing/)
      expect(readIndex().final).toBeNull()
    })

    it('on a daily with no snapshot metadata', async () => {
      writeIndex()
      await expect(stamp()).rejects.toThrow(/metadata/)
    })

    it('on an index of another month end', async () => {
      writeDaily('2026-12-02')
      writeIndex()
      await expect(stamp('2026-12-02')).rejects.toThrow(/2026-11-30/)
      expect(readIndex().final).toBeNull()
    })

    it('on a closing revision on or after the daily (a rerun of an earlier day)', async () => {
      writeDaily('2026-11-02')
      writeIndex()
      await expect(stamp('2026-11-02')).rejects.toThrow(/2026-11-03/)
      expect(readIndex().final).toBeNull()
    })

    it('on a malformed index', async () => {
      writeDaily(DAILY)
      fs.writeFileSync(indexFile, '{"nope":1}')
      await expect(stamp()).rejects.toThrow(/index/)
      expect(fs.readFileSync(indexFile, 'utf-8')).toBe('{"nope":1}')
    })

    it('on a date that is not YYYY-MM-DD', async () => {
      writeIndex()
      await expect(stamp('2026-11')).rejects.toThrow(/YYYY-MM-DD/)
    })
  })
})
