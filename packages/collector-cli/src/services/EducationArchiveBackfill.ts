/**
 * EducationArchiveBackfill — one-time, scoped backfill of prior-program-year
 * Education-Achievement counts (epic #1145, Sprint 1 #1146; operator ruling
 * 2026-06-10 on #1070).
 *
 * The "Educational Achievement Archive" report (GUID below) is empty for the
 * current PY but returns a prior PY's full achievement ledger via the `year`
 * param — re-verified live 2026-06-12 for PYs 2019-2020 … 2024-2025 (distinct
 * content per PY; current PY returns a 0-byte body). The ledger is aggregated
 * to de-identified per-(club, award) counts at parse time (the archive emits
 * no Member column; the KEEP-only projection drops one defensively if it ever
 * appears) and written into the per-district reports dataset at the PY-end
 * snapshot date: `snapshots/<endYear>-06-30/district_<id>_reports.json`.
 *
 * NOT part of the daily flow: the archive GUID stays out of
 * `IN_SCOPE_REPORT_GUIDS`. This module is invoked only by the
 * `backfill-education-archive` CLI command, and the bulk run is
 * operator-executed against staging first (ADR-002 validate-first — see
 * `docs/runbooks/education-archive-backfill.md`).
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import {
  DistrictReportsDatasetSchema,
  type DistrictReportsDataset,
} from '@toastmasters/shared-contracts'

import type { DailyReportFetcher } from './DailyReportFetcher.js'
import {
  extractReportAsOf,
  parseDistrictReport,
  type EducationAchievementActivity,
} from './DailyReportParser.js'
import {
  districtReportsFileName,
  writeDistrictReports,
} from './DistrictReportsWriter.js'

/** The Educational Achievement Archive report-type GUID (spike #1063 §2). */
export const EDUCATION_ARCHIVE_GUID = 'a30b93f3-081e-42c8-9a36-137acb24be69'

/**
 * Map a program year to its end-of-year snapshot date (June 30 of the second
 * year) — the date dir the backfilled dataset lands in. Those month-end dirs
 * already exist from the historical snapshot backfill.
 */
export function programYearEndDate(programYear: string): string {
  const m = /^(\d{4})-(\d{4})$/.exec(programYear)
  if (!m || Number(m[2]) !== Number(m[1]) + 1) {
    throw new Error(
      `Invalid program year "${programYear}" — expected consecutive years as YYYY-YYYY (e.g. 2024-2025)`
    )
  }
  return `${m[2]}-06-30`
}

export interface BuildEducationArchiveDatasetInput {
  districtId: string
  programYear: string
  /** ISO timestamp; the caller supplies it (this module stays pure here). */
  generatedAt: string
  /** Parsed, de-identified per-(club, award) counts. */
  rows: EducationAchievementActivity[]
  /** Raw response HTML — only read for the asOf banner (absent → ''). */
  html: string
}

/**
 * Build a reports dataset carrying ONLY the educationAchievements section,
 * provenanced to the archive report so a reader can tell backfilled prior-PY
 * data from the daily in-PY feed.
 */
export function buildEducationArchiveDataset(
  input: BuildEducationArchiveDatasetInput
): DistrictReportsDataset {
  return {
    districtId: input.districtId,
    programYear: input.programYear,
    generatedAt: input.generatedAt,
    sections: {
      educationAchievements: {
        sources: [
          {
            reportType: 'education-archive',
            tableId: EDUCATION_ARCHIVE_GUID,
            asOf: extractReportAsOf(input.html),
          },
        ],
        records: input.rows,
      },
    },
  }
}

export interface EducationArchiveBackfillOptions {
  cacheDir: string
  districtId: string
  /** Prior program year, e.g. '2024-2025'. */
  programYear: string
  /** Injected so tests never touch the network. */
  fetcher: DailyReportFetcher
  /** ISO timestamp stamped on the dataset. Defaults to now. */
  generatedAt?: string
  /** Fetch + parse + report counts, but write nothing. */
  dryRun?: boolean
}

export interface EducationArchiveBackfillResult {
  districtId: string
  programYear: string
  /** The PY-end snapshot date dir the dataset belongs to. */
  snapshotDate: string
  /** Aggregated (club, award) groups. */
  groups: number
  /** Raw achievement rows (the counts sum — the pre-aggregation ledger size). */
  achievements: number
  action: 'written' | 'merged' | 'skipped-empty' | 'dry-run'
  /** Absolute path written ('written'/'merged' only). */
  path?: string
}

/**
 * Fetch → parse → write one district's prior-PY archive counts into the
 * per-district reports dataset at the PY-end snapshot date.
 *
 * - An empty archive (the current-PY shape) is reported as 'skipped-empty',
 *   never written — absence stays unambiguous.
 * - An existing reports file at that date is MERGED (educationAchievements
 *   upserted, every other section preserved). Fail-closed: a malformed
 *   existing file, or one whose programYear disagrees, aborts the district.
 * - A persistent fetch failure throws — a one-shot backfill must not record
 *   a silent gap.
 */
export async function backfillEducationArchive(
  options: EducationArchiveBackfillOptions
): Promise<EducationArchiveBackfillResult> {
  const { cacheDir, districtId, programYear, fetcher } = options
  const snapshotDate = programYearEndDate(programYear)
  const generatedAt = options.generatedAt ?? new Date().toISOString()

  const raw = await fetcher.fetchReport(
    EDUCATION_ARCHIVE_GUID,
    districtId,
    programYear
  )
  if (raw === null) {
    throw new Error(
      `Archive fetch failed for district ${districtId} PY ${programYear} after retries`
    )
  }

  const parsed = parseDistrictReport(EDUCATION_ARCHIVE_GUID, raw.html)
  if (parsed.reportType !== 'education-archive') {
    throw new Error(
      `Expected education-archive, got "${parsed.reportType}" — registry drift`
    )
  }
  const rows = parsed.rows
  const groups = rows.length
  const achievements = rows.reduce((s, r) => s + r.achievementCount, 0)

  const base: EducationArchiveBackfillResult = {
    districtId,
    programYear,
    snapshotDate,
    groups,
    achievements,
    action: 'dry-run',
  }

  if (groups === 0) {
    return { ...base, action: 'skipped-empty' }
  }
  if (options.dryRun) {
    return base
  }

  const dataset = buildEducationArchiveDataset({
    districtId,
    programYear,
    generatedAt,
    rows,
    html: raw.html,
  })

  // Merge with an existing reports file at this date, if any (upsert the
  // educationAchievements section; preserve everything else). Fail-closed on
  // a malformed file or a programYear mismatch — never silently blend.
  const existingPath = path.join(
    cacheDir,
    'snapshots',
    snapshotDate,
    districtReportsFileName(districtId)
  )
  let action: 'written' | 'merged' = 'written'
  let toWrite = dataset
  const existingRaw = await fs.readFile(existingPath, 'utf-8').catch(() => null)
  if (existingRaw !== null) {
    const existing = DistrictReportsDatasetSchema.safeParse(
      JSON.parse(existingRaw)
    )
    if (!existing.success) {
      throw new Error(
        `Existing reports file at ${existingPath} failed schema validation — refusing to merge: ${existing.error.message}`
      )
    }
    if (existing.data.programYear !== programYear) {
      throw new Error(
        `Existing reports file at ${existingPath} carries program year ${existing.data.programYear}, expected ${programYear} — refusing to merge`
      )
    }
    toWrite = {
      ...existing.data,
      generatedAt,
      sections: {
        ...existing.data.sections,
        educationAchievements: dataset.sections.educationAchievements,
      },
    }
    action = 'merged'
  }

  const written = await writeDistrictReports(cacheDir, snapshotDate, toWrite)
  return { ...base, action, path: written }
}
