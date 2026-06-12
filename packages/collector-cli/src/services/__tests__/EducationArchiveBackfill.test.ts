import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DistrictReportsDatasetSchema } from '@toastmasters/shared-contracts'

import { DailyReportFetcher } from '../DailyReportFetcher'
import {
  EDUCATION_ARCHIVE_GUID,
  backfillEducationArchive,
  buildEducationArchiveDataset,
  programYearEndDate,
} from '../EducationArchiveBackfill'
import { parseDistrictReport } from '../DailyReportParser'

/**
 * Sprint 1 #1146 (epic #1145) — one-time prior-PY Education-Achievement
 * backfill. The Educational Achievement Archive report returns a prior PY's
 * full achievement ledger via the `year` param (re-verified live 2026-06-12);
 * this service fetches it, aggregates to de-identified per-(club, award)
 * counts, and writes them into the per-district reports dataset at the PY-end
 * snapshot date (`snapshots/<endYear>-06-30/district_<id>_reports.json`).
 */

const FIXTURE_DIR = fileURLToPath(
  new URL('../../__tests__/fixtures/daily-reports/', import.meta.url)
)
const readFixture = (name: string): string =>
  readFileSync(FIXTURE_DIR + name, 'utf8')

const ARCHIVE_FIXTURE = 'education-archive-2024-2025.html'

/** Fake fetch: serves the populated archive fixture for any archive-GUID URL. */
const archiveFetch = async (url: string) => {
  if (!url.includes(EDUCATION_ARCHIVE_GUID)) {
    return { ok: false, status: 404, text: async () => '' }
  }
  return {
    ok: true,
    status: 200,
    text: async () => readFixture(ARCHIVE_FIXTURE),
  }
}

/** Fake fetch: the current-PY shape — HTTP 200 with an empty body. */
const emptyArchiveFetch = async () => ({
  ok: true,
  status: 200,
  text: async () => '',
})

const makeFetcher = (fetchImpl: typeof archiveFetch) =>
  new DailyReportFetcher({ fetchImpl, requestIntervalMs: 0 })

describe('programYearEndDate', () => {
  it('maps a program year to its June-30 end date', () => {
    expect(programYearEndDate('2024-2025')).toBe('2025-06-30')
    expect(programYearEndDate('2019-2020')).toBe('2020-06-30')
  })

  it.each(['2024', '2024-25', '2024-2026', '2025-2024', 'abcd-efgh'])(
    'rejects malformed program year %s',
    py => {
      expect(() => programYearEndDate(py)).toThrow(/program year/i)
    }
  )
})

describe('buildEducationArchiveDataset', () => {
  it('builds a schema-valid dataset with only the educationAchievements section, provenanced to the archive', () => {
    const html = readFixture(ARCHIVE_FIXTURE)
    const parsed = parseDistrictReport(EDUCATION_ARCHIVE_GUID, html)
    if (parsed.reportType !== 'education-archive') {
      throw new Error('expected education-archive')
    }
    const dataset = buildEducationArchiveDataset({
      districtId: '61',
      programYear: '2024-2025',
      generatedAt: '2026-06-12T12:00:00.000Z',
      rows: parsed.rows,
      html,
    })
    expect(DistrictReportsDatasetSchema.safeParse(dataset).success).toBe(true)
    expect(Object.keys(dataset.sections)).toEqual(['educationAchievements'])
    const section = dataset.sections.educationAchievements!
    // Lesson 153 pinning carried through: 40 raw rows → 32 groups, sum 40.
    expect(section.records).toHaveLength(32)
    expect(section.records.reduce((s, r) => s + r.achievementCount, 0)).toBe(40)
    expect(section.sources).toEqual([
      {
        reportType: 'education-archive',
        tableId: EDUCATION_ARCHIVE_GUID,
        // The archive carries no "Updated: <date>" banner (it is updated
        // yearly) — asOf is '' per the schema's documented absent case.
        asOf: '',
      },
    ])
    expect(dataset.programYear).toBe('2024-2025')
  })
})

describe('backfillEducationArchive (fetch → parse → write)', () => {
  let cacheDir: string
  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'archive-backfill-'))
  })
  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true })
  })

  it('writes the dataset to the PY-end snapshot date dir', async () => {
    const result = await backfillEducationArchive({
      cacheDir,
      districtId: '61',
      programYear: '2024-2025',
      fetcher: makeFetcher(archiveFetch),
      generatedAt: '2026-06-12T12:00:00.000Z',
    })
    expect(result.action).toBe('written')
    expect(result.snapshotDate).toBe('2025-06-30')
    expect(result.groups).toBe(32)
    expect(result.achievements).toBe(40)
    const expectedPath = join(
      cacheDir,
      'snapshots',
      '2025-06-30',
      'district_61_reports.json'
    )
    expect(result.path).toBe(expectedPath)
    const written = JSON.parse(await readFile(expectedPath, 'utf8'))
    expect(DistrictReportsDatasetSchema.safeParse(written).success).toBe(true)
    expect(written.programYear).toBe('2024-2025')
    expect(written.sections.educationAchievements.records).toHaveLength(32)
  })

  it('skips (no write) when the archive returns an empty body', async () => {
    const result = await backfillEducationArchive({
      cacheDir,
      districtId: '61',
      programYear: '2025-2026',
      fetcher: makeFetcher(emptyArchiveFetch),
    })
    expect(result.action).toBe('skipped-empty')
    expect(result.path).toBeUndefined()
    const dir = join(cacheDir, 'snapshots', '2026-06-30')
    await expect(
      readFile(join(dir, 'district_61_reports.json'))
    ).rejects.toThrow()
  })

  it('dry-run fetches and reports counts but writes nothing', async () => {
    const result = await backfillEducationArchive({
      cacheDir,
      districtId: '61',
      programYear: '2024-2025',
      fetcher: makeFetcher(archiveFetch),
      dryRun: true,
    })
    expect(result.action).toBe('dry-run')
    expect(result.groups).toBe(32)
    expect(result.achievements).toBe(40)
    await expect(
      readFile(
        join(cacheDir, 'snapshots', '2025-06-30', 'district_61_reports.json')
      )
    ).rejects.toThrow()
  })

  it('merges into an existing reports file, preserving other sections', async () => {
    // A reports file already at the PY-end date (e.g. from a prior partial
    // run or a future daily-flow write) must be upserted, never clobbered.
    const dir = join(cacheDir, 'snapshots', '2025-06-30')
    await mkdir(dir, { recursive: true })
    const existing = {
      districtId: '61',
      programYear: '2024-2025',
      generatedAt: '2025-07-01T00:00:00.000Z',
      sections: {
        coaches: {
          sources: [
            { reportType: 'coaches', tableId: 'x', asOf: 'June 30, 2025' },
          ],
          records: [
            {
              club: '123',
              clubName: 'Club X',
              code: 'C',
              beginDate: '7/1/2024',
              status: 'PENDING',
              activeCoach: true,
            },
          ],
        },
      },
    }
    await writeFile(
      join(dir, 'district_61_reports.json'),
      JSON.stringify(existing),
      'utf-8'
    )

    const result = await backfillEducationArchive({
      cacheDir,
      districtId: '61',
      programYear: '2024-2025',
      fetcher: makeFetcher(archiveFetch),
      generatedAt: '2026-06-12T12:00:00.000Z',
    })
    expect(result.action).toBe('merged')
    const written = JSON.parse(
      await readFile(join(dir, 'district_61_reports.json'), 'utf8')
    )
    expect(DistrictReportsDatasetSchema.safeParse(written).success).toBe(true)
    // Both the pre-existing section and the backfilled one survive.
    expect(Object.keys(written.sections).sort()).toEqual([
      'coaches',
      'educationAchievements',
    ])
    expect(written.sections.coaches.records).toHaveLength(1)
    expect(written.sections.educationAchievements.records).toHaveLength(32)
    expect(written.generatedAt).toBe('2026-06-12T12:00:00.000Z')
  })

  it('fails closed when the existing reports file is malformed', async () => {
    const dir = join(cacheDir, 'snapshots', '2025-06-30')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'district_61_reports.json'),
      '{"not": "a dataset"}',
      'utf-8'
    )
    await expect(
      backfillEducationArchive({
        cacheDir,
        districtId: '61',
        programYear: '2024-2025',
        fetcher: makeFetcher(archiveFetch),
      })
    ).rejects.toThrow(/schema|invalid/i)
  })

  it("fails closed when the existing file's programYear disagrees", async () => {
    // A PY mismatch at the same snapshot date means something upstream is
    // wrong (wrong date mapping or a corrupted file) — never silently blend.
    const dir = join(cacheDir, 'snapshots', '2025-06-30')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'district_61_reports.json'),
      JSON.stringify({
        districtId: '61',
        programYear: '2023-2024',
        generatedAt: '2025-07-01T00:00:00.000Z',
        sections: {},
      }),
      'utf-8'
    )
    await expect(
      backfillEducationArchive({
        cacheDir,
        districtId: '61',
        programYear: '2024-2025',
        fetcher: makeFetcher(archiveFetch),
      })
    ).rejects.toThrow(/program year/i)
  })

  it('propagates a persistent fetch failure as an error (not a silent skip)', async () => {
    const failFetch = async () => ({
      ok: false,
      status: 500,
      text: async () => '',
    })
    const fetcher = new DailyReportFetcher({
      fetchImpl: failFetch,
      requestIntervalMs: 0,
      maxRetries: 0,
      backoffMs: 0,
    })
    await expect(
      backfillEducationArchive({
        cacheDir,
        districtId: '61',
        programYear: '2024-2025',
        fetcher,
      })
    ).rejects.toThrow(/fetch/i)
  })

  it('no personal value appears in the written bytes (end-to-end privacy guard)', async () => {
    await backfillEducationArchive({
      cacheDir,
      districtId: '61',
      programYear: '2024-2025',
      fetcher: makeFetcher(archiveFetch),
    })
    const raw = await readFile(
      join(cacheDir, 'snapshots', '2025-06-30', 'district_61_reports.json'),
      'utf8'
    )
    // The archive fixture has no Member column at all; assert the structural
    // invariant instead — no per-row Date and no member-like key survives.
    expect(raw).not.toMatch(/"member"/i)
    expect(raw).not.toMatch(/"date"\s*:/i)
  })
})
