import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import type { AllDistrictsRankingsData } from '@taverns-red/shared-contracts'
import {
  loadDateDigests,
  loadValueDiffFetchPlan,
  readDateList,
  runValueDiff,
} from '../SnapshotValueDiffLoader.js'

function rankings(
  date: string,
  totalPayments: number
): AllDistrictsRankingsData {
  return {
    metadata: {
      snapshotId: date,
      calculatedAt: '2024-07-01T00:00:00.000Z',
      schemaVersion: '1.0.0',
      calculationVersion: '1.0.0',
      rankingVersion: '1.0.0',
      sourceCsvDate: date,
      csvFetchedAt: '2024-07-01T00:00:00.000Z',
      totalDistricts: 1,
      fromCache: false,
    },
    rankings: [
      {
        districtId: '61',
        districtName: 'District 61',
        region: 'Region 7',
        paidClubs: 100,
        paidClubBase: 98,
        clubGrowthPercent: 2.04,
        totalPayments,
        paymentBase: 4800,
        paymentGrowthPercent: 4.17,
        activeClubs: 95,
        distinguishedClubs: 30,
        selectDistinguished: 10,
        presidentsDistinguished: 5,
        distinguishedPercent: 30,
        clubsRank: 3,
        paymentsRank: 4,
        distinguishedRank: 2,
        aggregateScore: 88.5,
        overallRank: 3,
      },
    ],
  }
}

function writeSnapshot(
  root: string,
  date: string,
  data: AllDistrictsRankingsData
) {
  const dir = join(root, date)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'all-districts-rankings.json'),
    JSON.stringify(data, null, 2)
  )
}

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'svd-'))
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('loadDateDigests', () => {
  it('loads one digest per date dir that has all-districts-rankings.json', () => {
    const root = join(tmp, 'staging')
    writeSnapshot(root, '2024-06-30', rankings('2024-06-30', 5000))
    writeSnapshot(root, '2024-07-31', rankings('2024-07-31', 5100))
    mkdirSync(join(root, 'not-a-snapshot')) // skipped: no rankings file
    const digests = loadDateDigests(root)
    expect(digests.map(d => d.date).sort()).toEqual([
      '2024-06-30',
      '2024-07-31',
    ])
  })

  it('returns [] for a missing root', () => {
    expect(loadDateDigests(join(tmp, 'does-not-exist'))).toEqual([])
  })
})

describe('runValueDiff', () => {
  it('promotes (exit 0) when staging is additive-only', () => {
    const staging = join(tmp, 'staging')
    const prod = join(tmp, 'prod')
    writeSnapshot(prod, '2024-06-30', rankings('2024-06-30', 5000))
    writeSnapshot(staging, '2024-06-30', rankings('2024-06-30', 5000))
    writeSnapshot(staging, '2024-07-31', rankings('2024-07-31', 5100)) // new
    const { decision, exitCode } = runValueDiff({
      stagingDir: staging,
      prodDir: prod,
    })
    expect(decision.promote).toBe(true)
    expect(exitCode).toBe(0)
  })

  it('blocks (exit 1) a value re-derive unless allowValueChanges', () => {
    const staging = join(tmp, 'staging')
    const prod = join(tmp, 'prod')
    writeSnapshot(prod, '2024-06-30', rankings('2024-06-30', 5000))
    writeSnapshot(staging, '2024-06-30', rankings('2024-06-30', 5001)) // changed
    const blocked = runValueDiff({ stagingDir: staging, prodDir: prod })
    expect(blocked.decision.promote).toBe(false)
    expect(blocked.decision.requiresReview).toBe(true)
    expect(blocked.exitCode).toBe(1)

    const allowed = runValueDiff({
      stagingDir: staging,
      prodDir: prod,
      allowValueChanges: true,
    })
    expect(allowed.decision.promote).toBe(true)
    expect(allowed.exitCode).toBe(0)
  })
})

describe('runValueDiff — Closing-Pinned Auto-Allow end-to-end (#1086)', () => {
  /** rankings() variant with an independent As-of date (closing signature). */
  function closingRankings(
    date: string,
    sourceCsvDate: string,
    totalPayments: number
  ): AllDistrictsRankingsData {
    const data = rankings(date, totalPayments)
    return { ...data, metadata: { ...data.metadata, sourceCsvDate } }
  }

  it('auto-allows (exit 0) a closing-pinned within-cap reconciliation', () => {
    const staging = join(tmp, 'staging')
    const prod = join(tmp, 'prod')
    writeSnapshot(
      prod,
      '2026-05-31',
      closingRankings('2026-05-31', '2026-05-31', 5000)
    )
    writeSnapshot(
      staging,
      '2026-05-31',
      closingRankings('2026-05-31', '2026-06-02', 5050)
    )
    const { decision, exitCode } = runValueDiff({
      stagingDir: staging,
      prodDir: prod,
    })
    expect(decision.promote).toBe(true)
    expect(decision.requiresReview).toBe(false)
    expect(decision.autoAllowed).toBe('closing-reconciliation')
    expect(decision.closingDeltas).toHaveLength(1)
    expect(exitCode).toBe(0)
  })

  it('blocks (exit 1) a closing-pinned change when closingAutoAllow is false (#1673)', () => {
    // Mirrors run 37535062136: a year-end rebuild from a later in-window as-of.
    const staging = join(tmp, 'staging')
    const prod = join(tmp, 'prod')
    writeSnapshot(
      prod,
      '2019-06-30',
      closingRankings('2019-06-30', '2019-07-16', 5000)
    )
    writeSnapshot(
      staging,
      '2019-06-30',
      closingRankings('2019-06-30', '2019-07-17', 5050)
    )
    const { decision, exitCode } = runValueDiff({
      stagingDir: staging,
      prodDir: prod,
      closingAutoAllow: false,
    })
    expect(decision.promote).toBe(false)
    expect(decision.autoAllowed).toBeUndefined()
    expect(exitCode).toBe(1)
  })

  it('auto-allows (exit 0) a closing-period counter decrease (#1092)', () => {
    const staging = join(tmp, 'staging')
    const prod = join(tmp, 'prod')
    writeSnapshot(
      prod,
      '2026-05-31',
      closingRankings('2026-05-31', '2026-05-31', 5000)
    )
    writeSnapshot(
      staging,
      '2026-05-31',
      closingRankings('2026-05-31', '2026-06-02', 4999)
    )
    const { decision, exitCode } = runValueDiff({
      stagingDir: staging,
      prodDir: prod,
    })
    expect(decision.promote).toBe(true)
    expect(decision.autoAllowed).toBe('closing-reconciliation')
    expect(decision.closingDeltas).toEqual([
      expect.objectContaining({ delta: -1 }),
    ])
    expect(exitCode).toBe(0)
  })

  it('auto-allows (exit 0) a large closing counter move — no cap (#1292)', () => {
    const staging = join(tmp, 'staging')
    const prod = join(tmp, 'prod')
    writeSnapshot(
      prod,
      '2026-05-31',
      closingRankings('2026-05-31', '2026-05-31', 5000)
    )
    writeSnapshot(
      staging,
      '2026-05-31',
      closingRankings('2026-05-31', '2026-06-02', 4400) // Δ −600, no longer capped
    )
    const { decision, exitCode } = runValueDiff({
      stagingDir: staging,
      prodDir: prod,
    })
    expect(decision.promote).toBe(true)
    expect(decision.autoAllowed).toBe('closing-reconciliation')
    expect(decision.closingDeltas).toEqual([
      expect.objectContaining({ delta: -600 }),
    ])
    expect(exitCode).toBe(0)
  })
})

describe('runValueDiff — hash-equal dates skipped by the fetch plan (#1730)', () => {
  /**
   * Today every overlap date is downloaded from both buckets. With the plan,
   * hash-equal dates are not downloaded and are passed as hashEqualDates.
   * The verdict and report must be identical either way.
   */
  interface Dirs {
    staging: string
    prod: string
  }

  /** Full download: three overlap dates; 2026-10-08 changed if asked. */
  function fullDownload(changed: boolean): Dirs {
    const full = { staging: join(tmp, 'full-s'), prod: join(tmp, 'full-p') }
    for (const d of ['2026-09-29', '2026-09-30', '2026-10-08']) {
      writeSnapshot(full.prod, d, rankings(d, 5000))
      const v = changed && d === '2026-10-08' ? 5001 : 5000
      writeSnapshot(full.staging, d, rankings(d, v))
    }
    return full
  }

  /** The same download minus the hash-equal dates (they are not fetched). */
  function withoutSkipped(full: Dirs, skip: string[]): Dirs {
    const out = { staging: join(tmp, 'skip-s'), prod: join(tmp, 'skip-p') }
    cpSync(full.staging, out.staging, { recursive: true })
    cpSync(full.prod, out.prod, { recursive: true })
    for (const d of skip) {
      rmSync(join(out.staging, d), { recursive: true, force: true })
      rmSync(join(out.prod, d), { recursive: true, force: true })
    }
    return out
  }

  for (const allowValueChanges of [false, true]) {
    it(`same verdict + report with one changed date (allow=${allowValueChanges})`, () => {
      const full = fullDownload(true)
      const skip = ['2026-09-29', '2026-09-30']
      const before = runValueDiff({
        stagingDir: full.staging,
        prodDir: full.prod,
        allowValueChanges,
      })
      const s = withoutSkipped(full, skip)
      const after = runValueDiff({
        stagingDir: s.staging,
        prodDir: s.prod,
        allowValueChanges,
        hashEqualDates: skip,
      })
      expect(before.report.changed).toHaveLength(1)
      expect(after).toEqual(before)
    })
  }

  it('same verdict + report when nothing changed (the additive reason counts unchanged dates)', () => {
    const full = fullDownload(false)
    writeSnapshot(full.staging, '2026-10-09', rankings('2026-10-09', 5000))
    const skip = ['2026-09-29', '2026-09-30', '2026-10-08']
    const before = runValueDiff({
      stagingDir: full.staging,
      prodDir: full.prod,
    })
    const s = withoutSkipped(full, skip)
    const after = runValueDiff({
      stagingDir: s.staging,
      prodDir: s.prod,
      hashEqualDates: skip,
    })
    expect(before.decision.promote).toBe(true)
    expect(after).toEqual(before)
  })

  it('a date on only one side is still flagged exactly as today (removed blocks)', () => {
    const full = fullDownload(false)
    writeSnapshot(full.prod, '2026-10-09', rankings('2026-10-09', 5000))
    const skip = ['2026-09-29', '2026-09-30']
    const before = runValueDiff({
      stagingDir: full.staging,
      prodDir: full.prod,
    })
    const s = withoutSkipped(full, skip)
    const after = runValueDiff({
      stagingDir: s.staging,
      prodDir: s.prod,
      hashEqualDates: skip,
    })
    expect(before.report.removed).toEqual(['2026-10-09'])
    expect(before.decision.promote).toBe(false)
    expect(after).toEqual(before)
  })

  it('a hash-equal date that was downloaded anyway is judged by its digests', () => {
    const full = fullDownload(true)
    const result = runValueDiff({
      stagingDir: full.staging,
      prodDir: full.prod,
      hashEqualDates: ['2026-10-08', '2026-10-08'],
    })
    expect(result.report.changed.map(c => c.date)).toEqual(['2026-10-08'])
    expect(result.report.overlap).toBe(3)
  })
})

describe('readDateList / loadValueDiffFetchPlan (#1730)', () => {
  const listing = (f: string): string =>
    fileURLToPath(new URL(`./fixtures/gcs-objects-list/${f}`, import.meta.url))

  it('readDateList reads one date per line and ignores blanks', () => {
    const f = join(tmp, 'dates.txt')
    writeFileSync(f, '2026-10-08\n\n2026-10-09\n')
    expect(readDateList(f)).toEqual(['2026-10-08', '2026-10-09'])
  })

  it('plans from the recorded listing files', () => {
    const overlap = join(tmp, 'overlap.txt')
    writeFileSync(overlap, '2026-10-08\n2026-10-09\n')
    const plan = loadValueDiffFetchPlan({
      overlapDatesFile: overlap,
      stagingListingFile: listing('staging-rankings.json'),
      prodListingFile: listing('prod-rankings.json'),
    })
    expect(plan.fullFetch).toBe(false)
    expect(plan.hashEqual).toEqual(['2026-10-08', '2026-10-09'])
    expect(plan.fetch).toEqual([])
  })

  it('falls back to a full fetch when a listing file is missing or not JSON', () => {
    const overlap = join(tmp, 'overlap.txt')
    writeFileSync(overlap, '2026-10-08\n')
    const bad = join(tmp, 'bad.json')
    writeFileSync(bad, 'ERROR: (gcloud.storage.objects.list) ...')
    for (const stagingListingFile of [join(tmp, 'missing.json'), bad]) {
      const plan = loadValueDiffFetchPlan({
        overlapDatesFile: overlap,
        stagingListingFile,
        prodListingFile: listing('prod-rankings.json'),
      })
      expect(plan.fullFetch).toBe(true)
      expect(plan.fetch).toEqual(['2026-10-08'])
      expect(plan.hashEqual).toEqual([])
    }
  })
})
