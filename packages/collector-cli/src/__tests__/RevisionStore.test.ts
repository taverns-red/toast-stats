/**
 * #2475 phase 1 — the collector keeps every month-end reconciliation
 * revision. After a closing collection is transformed (and enriched) into
 * `snapshots/<monthEnd>/`, `recordRevision` copies its district files,
 * write-once, to `snapshots/<monthEnd>/revisions/<asOf>/` and upserts
 * `revisions/index.json`. Revision 0, the in-month view of the month end
 * the first close overwrites, is taken from the prior copy of the month end
 * (staging's, before this run uploads) while that copy is still pre-close.
 *
 * Fixtures are written to a temp cache dir; nothing touches GCS.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ReconciliationRevisionIndexSchema } from '@taverns-red/shared-contracts'
import { recordRevision } from '../services/RevisionStore.js'

const MONTH_END = '2026-10-31'

let tmp: string
let snapshots: string
let prior: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'revision-store-'))
  snapshots = path.join(tmp, 'snapshots')
  prior = path.join(tmp, 'prior')
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

interface SnapshotFixture {
  closing?: { collectionDate: string }
  districts?: Record<string, unknown>
  createdAt?: string
  failed?: string[]
}

/** A snapshot directory as TransformService writes it (metadata + districts). */
function writeSnapshot(dir: string, f: SnapshotFixture = {}): void {
  fs.mkdirSync(dir, { recursive: true })
  const districts = f.districts ?? {
    '61': { districtId: '61', clubs: 'low' },
    F: { districtId: 'F', clubs: 'f' },
  }
  const metadata: Record<string, unknown> = {
    snapshotId: MONTH_END,
    createdAt: f.createdAt ?? '2026-11-01T13:05:00.000Z',
    dataAsOfDate: MONTH_END,
    successfulDistricts: Object.keys(districts),
    failedDistricts: f.failed ?? [],
  }
  if (f.closing) {
    metadata['isClosingPeriodData'] = true
    metadata['collectionDate'] = f.closing.collectionDate
    metadata['logicalDate'] = MONTH_END
  }
  fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify(metadata))
  for (const [id, body] of Object.entries(districts)) {
    fs.writeFileSync(
      path.join(dir, `district_${id}.json`),
      JSON.stringify(body)
    )
  }
}

const monthEndDir = () => path.join(snapshots, MONTH_END)
const revDir = () => path.join(monthEndDir(), 'revisions')
const readIndex = () =>
  ReconciliationRevisionIndexSchema.parse(
    JSON.parse(fs.readFileSync(path.join(revDir(), 'index.json'), 'utf-8'))
  )
const read = (rel: string) =>
  fs.readFileSync(path.join(monthEndDir(), rel), 'utf-8')

describe('recordRevision (#2475)', () => {
  it('copies the closing snapshot’s district files to revisions/<asOf>/ and indexes them', async () => {
    writeSnapshot(monthEndDir(), { closing: { collectionDate: '2026-11-01' } })

    const r = await recordRevision({
      snapshotsDir: snapshots,
      date: MONTH_END,
      asOf: '2026-11-01',
    })

    expect(r.recorded).toBe(true)
    expect(r.revisionZero).toBe('no-prior')
    expect(r.written).toEqual([
      'revisions/2026-11-01/district_61.json',
      'revisions/2026-11-01/district_F.json',
      'revisions/index.json',
    ])
    expect(read('revisions/2026-11-01/district_61.json')).toBe(
      read('district_61.json')
    )
    expect(readIndex()).toEqual({
      schemaVersion: 1,
      monthEnd: MONTH_END,
      dataMonth: '2026-10',
      revisions: [
        {
          asOf: '2026-11-01',
          collectedAt: '2026-11-01T13:05:00.000Z',
          closing: true,
          successfulDistricts: ['61', 'F'],
        },
      ],
      final: null,
    })
  })

  it('captures revision 0 from a pre-close prior copy of the month end', async () => {
    writeSnapshot(prior, {
      createdAt: '2026-10-31T13:05:00.000Z',
      districts: { '61': { districtId: '61', clubs: 'in-month' } },
    })
    writeSnapshot(monthEndDir(), { closing: { collectionDate: '2026-11-01' } })

    const r = await recordRevision({
      snapshotsDir: snapshots,
      date: MONTH_END,
      asOf: '2026-11-01',
      priorSnapshotDir: prior,
    })

    expect(r.revisionZero).toBe('recorded')
    expect(r.written[0]).toBe(`revisions/${MONTH_END}/district_61.json`)
    expect(JSON.parse(read(`revisions/${MONTH_END}/district_61.json`))).toEqual(
      { districtId: '61', clubs: 'in-month' }
    )
    expect(readIndex().revisions.map(x => [x.asOf, x.closing])).toEqual([
      [MONTH_END, false],
      ['2026-11-01', true],
    ])
    expect(readIndex().revisions[0]!.collectedAt).toBe(
      '2026-10-31T13:05:00.000Z'
    )
  })

  it('does not take revision 0 from a prior copy that is already a close', async () => {
    writeSnapshot(prior, { closing: { collectionDate: '2026-11-01' } })
    writeSnapshot(monthEndDir(), { closing: { collectionDate: '2026-11-02' } })

    const r = await recordRevision({
      snapshotsDir: snapshots,
      date: MONTH_END,
      asOf: '2026-11-02',
      priorSnapshotDir: prior,
    })

    expect(r.revisionZero).toBe('prior-is-closing')
    expect(fs.existsSync(path.join(revDir(), MONTH_END))).toBe(false)
  })

  it('upserts an existing (hydrated) index in as-of order, keeping earlier revisions', async () => {
    writeSnapshot(monthEndDir(), { closing: { collectionDate: '2026-11-01' } })
    await recordRevision({
      snapshotsDir: snapshots,
      date: MONTH_END,
      asOf: '2026-11-01',
    })
    // The next daily: only the index came back from staging, not the files.
    fs.rmSync(path.join(revDir(), '2026-11-01'), { recursive: true })
    writeSnapshot(monthEndDir(), {
      closing: { collectionDate: '2026-11-02' },
      createdAt: '2026-11-02T13:05:00.000Z',
      districts: { '61': { districtId: '61', clubs: 'active' } },
    })

    const r = await recordRevision({
      snapshotsDir: snapshots,
      date: MONTH_END,
      asOf: '2026-11-02',
    })

    expect(r.written).toEqual([
      'revisions/2026-11-02/district_61.json',
      'revisions/index.json',
    ])
    expect(readIndex().revisions.map(x => x.asOf)).toEqual([
      '2026-11-01',
      '2026-11-02',
    ])
    expect(readIndex().revisions[1]!.successfulDistricts).toEqual(['61'])
  })

  it('is write-once: an as-of the index already lists is refused and nothing changes', async () => {
    writeSnapshot(monthEndDir(), { closing: { collectionDate: '2026-11-01' } })
    await recordRevision({
      snapshotsDir: snapshots,
      date: MONTH_END,
      asOf: '2026-11-01',
    })
    const before = read('revisions/2026-11-01/district_61.json')
    const indexBefore = read('revisions/index.json')
    // A rebuild of the same close with different output.
    writeSnapshot(monthEndDir(), {
      closing: { collectionDate: '2026-11-01' },
      districts: { '61': { districtId: '61', clubs: 'rebuilt' } },
    })

    const r = await recordRevision({
      snapshotsDir: snapshots,
      date: MONTH_END,
      asOf: '2026-11-01',
    })

    expect(r.recorded).toBe(false)
    expect(r.refused).toMatch(/already recorded/)
    expect(r.written).toEqual([])
    expect(read('revisions/2026-11-01/district_61.json')).toBe(before)
    expect(read('revisions/index.json')).toBe(indexBefore)
  })

  it('refuses to overwrite a different revision file the index does not list', async () => {
    writeSnapshot(monthEndDir(), { closing: { collectionDate: '2026-11-01' } })
    const stray = path.join(revDir(), '2026-11-01', 'district_61.json')
    fs.mkdirSync(path.dirname(stray), { recursive: true })
    fs.writeFileSync(stray, '{"other":true}')

    await expect(
      recordRevision({
        snapshotsDir: snapshots,
        date: MONTH_END,
        asOf: '2026-11-01',
      })
    ).rejects.toThrow(/write-once/)
    expect(fs.readFileSync(stray, 'utf-8')).toBe('{"other":true}')
    expect(fs.existsSync(path.join(revDir(), 'index.json'))).toBe(false)
  })

  describe('fails closed', () => {
    it('on a month end that is not closing data', async () => {
      writeSnapshot(monthEndDir())
      await expect(
        recordRevision({
          snapshotsDir: snapshots,
          date: MONTH_END,
          asOf: '2026-11-01',
        })
      ).rejects.toThrow(/not closing-period data/)
    })

    it('on a collection date that disagrees with the snapshot’s', async () => {
      writeSnapshot(monthEndDir(), {
        closing: { collectionDate: '2026-11-01' },
      })
      await expect(
        recordRevision({
          snapshotsDir: snapshots,
          date: MONTH_END,
          asOf: '2026-11-02',
        })
      ).rejects.toThrow(/collectionDate 2026-11-01/)
    })

    it('on a date that is not a month end', async () => {
      await expect(
        recordRevision({
          snapshotsDir: snapshots,
          date: '2026-10-30',
          asOf: '2026-11-01',
        })
      ).rejects.toThrow(/not a month end/)
    })

    it('on a malformed existing index', async () => {
      writeSnapshot(monthEndDir(), {
        closing: { collectionDate: '2026-11-01' },
      })
      fs.mkdirSync(revDir(), { recursive: true })
      fs.writeFileSync(path.join(revDir(), 'index.json'), '{"nope":1}')
      await expect(
        recordRevision({
          snapshotsDir: snapshots,
          date: MONTH_END,
          asOf: '2026-11-01',
        })
      ).rejects.toThrow(/index/)
    })

    it('on a successful district whose file is missing', async () => {
      writeSnapshot(monthEndDir(), {
        closing: { collectionDate: '2026-11-01' },
      })
      fs.rmSync(path.join(monthEndDir(), 'district_F.json'))
      await expect(
        recordRevision({
          snapshotsDir: snapshots,
          date: MONTH_END,
          asOf: '2026-11-01',
        })
      ).rejects.toThrow(/district_F\.json/)
    })

    it('on a district id that would leave the snapshot directory', async () => {
      writeSnapshot(monthEndDir(), {
        closing: { collectionDate: '2026-11-01' },
      })
      const meta = JSON.parse(read('metadata.json'))
      meta.successfulDistricts = ['../../x']
      fs.writeFileSync(
        path.join(monthEndDir(), 'metadata.json'),
        JSON.stringify(meta)
      )
      await expect(
        recordRevision({
          snapshotsDir: snapshots,
          date: MONTH_END,
          asOf: '2026-11-01',
        })
      ).rejects.toThrow()
    })
  })

  describe('revision 0 is independent of the closing revision (PR #2483 review, fix 2)', () => {
    it('a prior copy missing a district file still records the closing revision', async () => {
      writeSnapshot(prior, { districts: { '61': { v: 'in-month' } } })
      fs.rmSync(path.join(prior, 'district_61.json'))
      writeSnapshot(monthEndDir(), {
        closing: { collectionDate: '2026-11-01' },
      })

      const r = await recordRevision({
        snapshotsDir: snapshots,
        date: MONTH_END,
        asOf: '2026-11-01',
        priorSnapshotDir: prior,
      })

      expect(r.recorded).toBe(true)
      expect(r.revisionZero).toBe('failed')
      expect(r.revisionZeroError).toMatch(/district_61\.json/)
      expect(fs.existsSync(path.join(revDir(), MONTH_END))).toBe(false)
      expect(readIndex().revisions.map(x => x.asOf)).toEqual(['2026-11-01'])
    })

    it('unparseable prior metadata still records the closing revision', async () => {
      fs.mkdirSync(prior, { recursive: true })
      fs.writeFileSync(path.join(prior, 'metadata.json'), '\x1f\x8b garbage')
      writeSnapshot(monthEndDir(), {
        closing: { collectionDate: '2026-11-01' },
      })

      const r = await recordRevision({
        snapshotsDir: snapshots,
        date: MONTH_END,
        asOf: '2026-11-01',
        priorSnapshotDir: prior,
      })

      expect(r.recorded).toBe(true)
      expect(r.revisionZero).toBe('failed')
      expect(r.revisionZeroError).toBeTruthy()
    })

    it('a clean result reports no revision 0 error', async () => {
      writeSnapshot(monthEndDir(), {
        closing: { collectionDate: '2026-11-01' },
      })
      const r = await recordRevision({
        snapshotsDir: snapshots,
        date: MONTH_END,
        asOf: '2026-11-01',
      })
      expect(r.revisionZeroError).toBeNull()
    })
  })
})
