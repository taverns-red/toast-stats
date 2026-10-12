import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { EducationLedgerHistoryFileSchema } from '@taverns-red/shared-contracts'

import { DailyReportFetcher } from '../DailyReportFetcher'
import { EDUCATION_ARCHIVE_GUID } from '../EducationArchiveBackfill'
import {
  backfillEducationLedgerHistory,
  buildYearEndDistrictSummaryUrl,
  ledgerHistoryFilePath,
  resolveLedgerDistricts,
  runEducationLedgerHistoryBackfill,
} from '../EducationLedgerHistory'

/**
 * #1802 — backfill the education ledger history (2003-04 → 2018-19) from
 * TI's Educational Achievement Archive, keeping the per-award Date at month
 * granularity, into the dedicated raw prefix
 * `raw-education-ledger/<PY>/district_<id>.json`. One request per
 * (PY, district); idempotent and resumable (an existing valid file is never
 * re-fetched); a 0-byte body is recorded as `no-data` (the district did not
 * exist that year), never an error and never silently absent.
 */

const FIXTURE_DIR = fileURLToPath(
  new URL('../../__tests__/fixtures/daily-reports/', import.meta.url)
)
const fixture = (name: string): string =>
  readFileSync(FIXTURE_DIR + name, 'utf8')

const LEDGER_2018 = 'education-ledger-d61-2018-2019.html'

type FakeResponse = { ok: boolean; status: number; text(): Promise<string> }
const ok = (body: string): FakeResponse => ({
  ok: true,
  status: 200,
  text: async () => body,
})

/** A fetch that records every URL and serves `body(url)`. */
function recordingFetch(body: (url: string) => FakeResponse) {
  const urls: string[] = []
  const fetchImpl = async (url: string) => {
    urls.push(url)
    return body(url)
  }
  return { urls, fetchImpl }
}

const fetcherFor = (fetchImpl: (url: string) => Promise<FakeResponse>) =>
  new DailyReportFetcher({
    fetchImpl,
    requestIntervalMs: 0,
    maxRetries: 0,
    sleepImpl: async () => {},
  })

let cacheDir: string
beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'edu-ledger-history-'))
})
afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true })
})

describe('ledgerHistoryFilePath', () => {
  it('mirrors the object path under the cache dir', () => {
    expect(ledgerHistoryFilePath('/c', '2003-2004', '61')).toBe(
      '/c/raw-education-ledger/2003-2004/district_61.json'
    )
  })

  it('refuses a traversal district id before building a path', () => {
    expect(() => ledgerHistoryFilePath('/c', '2003-2004', '../x')).toThrow()
  })
})

describe('backfillEducationLedgerHistory', () => {
  it('fetches the archive for that PY and writes a schema-valid month-granular file', async () => {
    const { urls, fetchImpl } = recordingFetch(() => ok(fixture(LEDGER_2018)))
    const r = await backfillEducationLedgerHistory({
      cacheDir,
      districtId: '61',
      programYear: '2018-2019',
      fetcher: fetcherFor(fetchImpl),
      fetchedAt: '2026-10-12T15:00:00.000Z',
    })

    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain(`tableID=${EDUCATION_ARCHIVE_GUID}`)
    expect(urls[0]).toContain('district=61')
    expect(urls[0]).toContain('year=2018-2019')

    expect(r).toMatchObject({
      action: 'written',
      fetched: true,
      records: 37,
      achievements: 39,
      outOfWindowAchievements: 0,
      otherAwardCodes: ['', 'PWMENTORPGM'],
    })
    const written = JSON.parse(
      await readFile(ledgerHistoryFilePath(cacheDir, '2018-2019', '61'), 'utf8')
    )
    const parsed = EducationLedgerHistoryFileSchema.parse(written)
    expect(parsed).toMatchObject({
      districtId: '61',
      programYear: '2018-2019',
      status: 'ok',
      fetchedAt: '2026-10-12T15:00:00.000Z',
      source: {
        reportType: 'education-archive',
        tableId: EDUCATION_ARCHIVE_GUID,
      },
    })
    expect(parsed.records).toHaveLength(37)
  })

  it('records a 0-byte body as no-data (district did not exist that PY)', async () => {
    const { fetchImpl } = recordingFetch(() => ok(''))
    const r = await backfillEducationLedgerHistory({
      cacheDir,
      districtId: '228',
      programYear: '2010-2011',
      fetcher: fetcherFor(fetchImpl),
    })
    expect(r.action).toBe('no-data')
    const written = EducationLedgerHistoryFileSchema.parse(
      JSON.parse(
        await readFile(
          ledgerHistoryFilePath(cacheDir, '2010-2011', '228'),
          'utf8'
        )
      )
    )
    expect(written.status).toBe('no-data')
    expect(written.records).toEqual([])
  })

  it('is resumable: an existing valid file is skipped without a request', async () => {
    const first = recordingFetch(() => ok(fixture(LEDGER_2018)))
    await backfillEducationLedgerHistory({
      cacheDir,
      districtId: '61',
      programYear: '2018-2019',
      fetcher: fetcherFor(first.fetchImpl),
    })
    const path = ledgerHistoryFilePath(cacheDir, '2018-2019', '61')
    const before = await readFile(path, 'utf8')

    const second = recordingFetch(() => ok(''))
    const r = await backfillEducationLedgerHistory({
      cacheDir,
      districtId: '61',
      programYear: '2018-2019',
      fetcher: fetcherFor(second.fetchImpl),
    })
    expect(r.action).toBe('skipped-existing')
    expect(r.fetched).toBe(false)
    expect(second.urls).toEqual([])
    expect(await readFile(path, 'utf8')).toBe(before)
  })

  it('--force re-fetches and rewrites an existing file', async () => {
    const path = ledgerHistoryFilePath(cacheDir, '2010-2011', '228')
    const first = recordingFetch(() => ok(''))
    await backfillEducationLedgerHistory({
      cacheDir,
      districtId: '228',
      programYear: '2010-2011',
      fetcher: fetcherFor(first.fetchImpl),
    })
    const second = recordingFetch(() => ok(fixture(LEDGER_2018)))
    const r = await backfillEducationLedgerHistory({
      cacheDir,
      districtId: '228',
      programYear: '2010-2011',
      fetcher: fetcherFor(second.fetchImpl),
      force: true,
    })
    expect(second.urls).toHaveLength(1)
    expect(r.action).toBe('written')
    expect(JSON.parse(await readFile(path, 'utf8')).status).toBe('ok')
  })

  it('re-fetches over an existing file that fails the schema (a torn write is not "done")', async () => {
    const path = ledgerHistoryFilePath(cacheDir, '2018-2019', '61')
    await mkdir(join(cacheDir, 'raw-education-ledger', '2018-2019'), {
      recursive: true,
    })
    await writeFile(path, '{"schemaVersion":')
    const { urls, fetchImpl } = recordingFetch(() => ok(fixture(LEDGER_2018)))
    const r = await backfillEducationLedgerHistory({
      cacheDir,
      districtId: '61',
      programYear: '2018-2019',
      fetcher: fetcherFor(fetchImpl),
    })
    expect(urls).toHaveLength(1)
    expect(r.action).toBe('written')
  })

  it('dry-run fetches and counts but writes nothing', async () => {
    const { fetchImpl } = recordingFetch(() => ok(fixture(LEDGER_2018)))
    const r = await backfillEducationLedgerHistory({
      cacheDir,
      districtId: '61',
      programYear: '2018-2019',
      fetcher: fetcherFor(fetchImpl),
      dryRun: true,
    })
    expect(r).toMatchObject({
      action: 'dry-run',
      records: 37,
      achievements: 39,
    })
    await expect(
      stat(ledgerHistoryFilePath(cacheDir, '2018-2019', '61'))
    ).rejects.toThrow()
  })

  it('a persistent fetch failure throws and writes nothing (no silent gap)', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    })
    await expect(
      backfillEducationLedgerHistory({
        cacheDir,
        districtId: '61',
        programYear: '2018-2019',
        fetcher: fetcherFor(fetchImpl),
      })
    ).rejects.toThrow(/fetch failed/i)
    await expect(
      stat(ledgerHistoryFilePath(cacheDir, '2018-2019', '61'))
    ).rejects.toThrow()
  })

  it('counts achievements dated outside the program year instead of hiding them', async () => {
    // The 2018-19 fixture served as if it were 2003-04: every month is out of window.
    const { fetchImpl } = recordingFetch(() => ok(fixture(LEDGER_2018)))
    const r = await backfillEducationLedgerHistory({
      cacheDir,
      districtId: '61',
      programYear: '2003-2004',
      fetcher: fetcherFor(fetchImpl),
      dryRun: true,
    })
    expect(r.outOfWindowAchievements).toBe(39)
  })

  it.each(['2002-2003', '2003-04', 'x'])(
    'refuses program year %j (archive starts at 2003-2004)',
    async programYear => {
      const { urls, fetchImpl } = recordingFetch(() => ok(''))
      await expect(
        backfillEducationLedgerHistory({
          cacheDir,
          districtId: '61',
          programYear,
          fetcher: fetcherFor(fetchImpl),
        })
      ).rejects.toThrow()
      expect(urls).toEqual([])
    }
  )
})

describe('resolveLedgerDistricts', () => {
  const SUMMARY = 'districtsummary-2008-2009-trimmed.csv'

  it('builds the year-end districtsummary URL (month-end slot set, as-of empty: the final list)', () => {
    expect(buildYearEndDistrictSummaryUrl('2013-2014')).toBe(
      'https://dashboards.toastmasters.org/2013-2014/export.aspx?type=CSV&report=districtsummary~6/30/2014~~2013-2014'
    )
  })

  it('from 2008-09 on, uses that year’s own districtsummary list', async () => {
    const asked: string[] = []
    const r = await resolveLedgerDistricts('2008-2009', async py => {
      asked.push(py)
      return fixture(SUMMARY)
    })
    expect(asked).toEqual(['2008-2009'])
    expect(r.source).toBe('districtsummary')
    expect(r.districts).toEqual(['01', '02', '61', '86', 'F', 'U'])
  })

  it('a later year whose list is not valid CSV fails closed (no guessed list)', async () => {
    await expect(
      resolveLedgerDistricts('2012-2013', async () => '<html>error</html>')
    ).rejects.toThrow(/districtsummary/)
  })

  it('before 2008-09 (no dashboard), probes the 2008-09 list plus every number up to its maximum', async () => {
    const asked: string[] = []
    const r = await resolveLedgerDistricts('2005-2006', async py => {
      asked.push(py)
      return fixture(SUMMARY)
    })
    expect(asked).toEqual(['2008-2009'])
    expect(r.source).toBe('candidate-range')
    // 01..86 zero-padded like the snapshot files, plus the lettered ids.
    expect(r.districts).toHaveLength(88)
    expect(r.districts.slice(0, 3)).toEqual(['01', '02', '03'])
    expect(r.districts).toContain('09')
    expect(r.districts).toContain('86')
    expect(r.districts.slice(-2)).toEqual(['F', 'U'])
    expect(new Set(r.districts).size).toBe(r.districts.length)
  })
})

describe('runEducationLedgerHistoryBackfill', () => {
  const routeFetch = (url: string): FakeResponse => {
    if (url.includes('district=228')) return ok('')
    return ok(fixture(LEDGER_2018))
  }

  it('spaces every network request by the rate, and none for skipped pairs', async () => {
    const sleeps: number[] = []
    const { urls, fetchImpl } = recordingFetch(routeFetch)
    const summary = await runEducationLedgerHistoryBackfill({
      cacheDir,
      programYears: ['2018-2019'],
      districts: ['61', '228'],
      fetcher: fetcherFor(fetchImpl),
      fetchSummaryCsv: async () => {
        throw new Error('not used with explicit districts')
      },
      rateMs: 1100,
      sleep: async ms => {
        sleeps.push(ms)
      },
    })
    expect(urls).toHaveLength(2)
    expect(sleeps).toEqual([1100])
    expect(summary).toMatchObject({
      totalPairs: 2,
      failed: 0,
      requests: 2,
      programYears: [
        {
          programYear: '2018-2019',
          districtSource: 'explicit',
          written: 1,
          noData: 1,
          skippedExisting: 0,
          failed: 0,
        },
      ],
    })

    // Resume: same run again makes no request and does not sleep.
    sleeps.length = 0
    const again = recordingFetch(routeFetch)
    const resumed = await runEducationLedgerHistoryBackfill({
      cacheDir,
      programYears: ['2018-2019'],
      districts: ['61', '228'],
      fetcher: fetcherFor(again.fetchImpl),
      fetchSummaryCsv: async () => '',
      rateMs: 1100,
      sleep: async ms => {
        sleeps.push(ms)
      },
    })
    expect(again.urls).toEqual([])
    expect(sleeps).toEqual([])
    expect(resumed.programYears[0]).toMatchObject({ skippedExisting: 2 })
    expect(resumed.requests).toBe(0)
  })

  it('a failed pair is reported and does not stop the run', async () => {
    const fetchImpl = async (url: string) =>
      url.includes('district=61')
        ? { ok: false, status: 503, text: async () => '' }
        : ok('')
    const summary = await runEducationLedgerHistoryBackfill({
      cacheDir,
      programYears: ['2010-2011'],
      districts: ['61', '228'],
      fetcher: fetcherFor(fetchImpl),
      fetchSummaryCsv: async () => '',
      rateMs: 0,
      sleep: async () => {},
    })
    expect(summary.failed).toBe(1)
    expect(summary.succeeded).toBe(1)
    expect(summary.results.find(r => r.districtId === '61')).toMatchObject({
      ok: false,
    })
  })

  it('resolves each PY’s districts from history when none are given, and counts that request', async () => {
    const { urls, fetchImpl } = recordingFetch(routeFetch)
    const summary = await runEducationLedgerHistoryBackfill({
      cacheDir,
      programYears: ['2008-2009'],
      fetcher: fetcherFor(fetchImpl),
      fetchSummaryCsv: async () =>
        fixture('districtsummary-2008-2009-trimmed.csv'),
      rateMs: 0,
      sleep: async () => {},
      dryRun: true,
    })
    expect(summary.programYears[0]).toMatchObject({
      districtSource: 'districtsummary',
      candidates: 6,
    })
    expect(urls).toHaveLength(6)
    expect(summary.requests).toBe(7)
  })

  it('a PY whose district list cannot be resolved fails that PY only', async () => {
    const { fetchImpl } = recordingFetch(routeFetch)
    const summary = await runEducationLedgerHistoryBackfill({
      cacheDir,
      programYears: ['2012-2013', '2018-2019'],
      districts: undefined,
      fetcher: fetcherFor(fetchImpl),
      fetchSummaryCsv: async py =>
        py === '2012-2013'
          ? '<html>error</html>'
          : fixture('districtsummary-2008-2009-trimmed.csv'),
      rateMs: 0,
      sleep: async () => {},
      dryRun: true,
    })
    expect(summary.programYears[0]).toMatchObject({
      programYear: '2012-2013',
      error: expect.stringMatching(/districtsummary/),
    })
    expect(summary.programYears[1]).toMatchObject({ candidates: 6 })
    expect(summary.failed).toBeGreaterThan(0)
  })
})
