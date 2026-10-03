/**
 * EducationMembersImport — one-off, operator-run import of a PRIOR program
 * year's distinct members per club from a TI Education Achievements CSV
 * export (#1603, for #1592's Team Spirit ranking).
 *
 * Why: the prior-PY Educational Achievement Archive has no `Member` column, so
 * distinct members can't be fetched for a closed PY. The district can export
 * TI's in-PY Education Achievements report (one row per award, with `Member`)
 * at year end; this module counts it with the SAME rules the daily collector
 * uses (`countMembersPerClub` → `memberIdentityKey` + `isCountedEducationAward`)
 * and writes ONLY `sections.educationMembers` into the existing PY-end reports
 * dataset `snapshots/<endYear>-06-30/district_<id>_reports.json`.
 *
 * Privacy (epic #1062): the CSV holds member names. They live only in memory
 * inside `countMembersPerClub`'s per-club Sets; only per-club counts leave.
 * Errors name headers, row numbers, dates and districts — never a cell of the
 * Member column.
 *
 * Validate-first (ADR-002): writes the LOCAL cache only, never creates a
 * dataset (the PY-end file must already exist — sync it from GCS first, R2),
 * and preserves every other byte-level section untouched. See
 * `docs/runbooks/education-members-import.md`.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { parse } from 'csv-parse/sync'
import {
  DistrictReportsDatasetSchema,
  isCountedEducationAward,
} from '@taverns-red/shared-contracts'

import { validateDistrictId } from '../utils/validateDistrictId.js'
import {
  countMembersPerClub,
  memberIdentityKey,
  type RawTable,
} from './DailyReportParser.js'
import { REPORT_GUIDS } from './DistrictReportsBuilder.js'
import { districtReportsFileName } from './DistrictReportsWriter.js'
import { programYearEndDate } from './EducationArchiveBackfill.js'

/** Headers the import cannot work without. */
const REQUIRED_HEADERS = ['Club', 'Award', 'Member', 'Date'] as const

export interface EducationExportTable extends RawTable {
  /** Rows above the header row (TI's title row), kept for the district check. */
  preamble: string[][]
}

/**
 * Parse a TI Education Achievements CSV export. Leading title rows (and a
 * UTF-8 BOM) are skipped: the header row is the first row containing any
 * required header. Fails loudly naming only the missing header(s).
 */
export function parseEducationExportCsv(text: string): EducationExportTable {
  const records = parse(text, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][]
  const cells = records.map(r => r.map(c => c.trim()))

  const headerIdx = cells.findIndex(r =>
    REQUIRED_HEADERS.some(h => r.includes(h))
  )
  if (headerIdx === -1) {
    throw new Error(
      `No header row found — expected a row with ${REQUIRED_HEADERS.map(
        h => `"${h}"`
      ).join(', ')}`
    )
  }
  const headers = cells[headerIdx] ?? []
  const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h))
  if (missing.length > 0) {
    throw new Error(
      `Missing required header(s) ${missing.map(h => `"${h}"`).join(', ')}`
    )
  }
  return {
    preamble: cells.slice(0, headerIdx),
    headers,
    rows: cells.slice(headerIdx + 1).filter(r => r.some(c => c !== '')),
  }
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** Parse a strict ISO `YYYY-MM-DD` calendar date, or null. */
function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.toISOString().slice(0, 10) === iso ? d : null
}

/**
 * Render an ISO date in the "Updated: <Month DD, YYYY>" form every other
 * reports source's `asOf` uses (`extractReportAsOf`), e.g. 'July 01, 2026'.
 */
export function formatReportAsOf(isoDate: string): string {
  const d = parseIsoDate(isoDate)
  if (!d) {
    throw new Error(`Invalid --as-of "${isoDate}" — expected YYYY-MM-DD`)
  }
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${MONTHS[d.getUTCMonth()]} ${day}, ${d.getUTCFullYear()}`
}

/** TI's row Date is `MM/DD/YYYY`; returns ISO `YYYY-MM-DD` or null. */
function tiDateToIso(raw: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw)
  if (!m) return null
  const iso = `${m[3]}-${m[1]}-${m[2]}`
  return parseIsoDate(iso) ? iso : null
}

/**
 * Fail unless the export is for `districtId` (title row "… District NN", or a
 * `District` column when present) and every row's Date is inside the PY.
 * Returns the latest row date (ISO) for the as-of sanity check.
 */
function validateExport(
  table: EducationExportTable,
  districtId: string,
  programYear: string
): string {
  for (const row of table.preamble) {
    const m = /\bDistrict\s+([A-Za-z0-9]+)\b/i.exec(row.join(' '))
    if (m && m[1] !== districtId) {
      throw new Error(
        `CSV title names district ${m[1]}, expected ${districtId} — wrong export?`
      )
    }
  }

  const districtIdx = table.headers.indexOf('District')
  const dateIdx = table.headers.indexOf('Date')
  const [startYear] = programYear.split('-')
  const pyStart = `${startYear}-07-01`
  const pyEnd = programYearEndDate(programYear)
  let latest = ''

  table.rows.forEach((row, i) => {
    // 1-based data-row number (not a file line): identifies a row without
    // printing any of its personal cells.
    const rowNo = i + 1
    if (districtIdx !== -1) {
      const d = row[districtIdx] ?? ''
      if (d !== districtId) {
        throw new Error(
          `Data row ${rowNo}: District "${d}" does not match --district ${districtId}`
        )
      }
    }
    const rawDate = row[dateIdx] ?? ''
    const iso = tiDateToIso(rawDate)
    if (!iso) {
      throw new Error(
        `Data row ${rowNo}: unparseable Date "${rawDate}" (expected MM/DD/YYYY)`
      )
    }
    if (iso < pyStart || iso > pyEnd) {
      throw new Error(
        `Data row ${rowNo}: Date ${rawDate} is outside program year ${programYear} (${pyStart} … ${pyEnd})`
      )
    }
    if (iso > latest) latest = iso
  })
  return latest
}

export interface ImportEducationMembersOptions {
  cacheDir: string
  districtId: string
  /** The export's program year, e.g. '2025-2026'. */
  programYear: string
  /** The CSV file's text. */
  csvText: string
  /** ISO date the export was taken (YYYY-MM-DD) — the section's provenance. */
  asOf: string
}

/** Counts only — this object is printed to stdout and must stay name-free. */
export interface ImportEducationMembersResult {
  districtId: string
  programYear: string
  snapshotDate: string
  path: string
  /** Data rows in the CSV (one per award). */
  rowsRead: number
  /** Rows with a club, a counted award and a member identity. */
  rowsCounted: number
  /** Clubs with ≥1 member with a counted award. */
  clubs: number
  /** Sum of distinct members with a counted award across clubs. */
  membersWithAward: number
}

/**
 * Import the export's distinct members per club into the existing PY-end
 * reports dataset, replacing ONLY `sections.educationMembers`. Idempotent.
 */
export async function importEducationMembers(
  options: ImportEducationMembersOptions
): Promise<ImportEducationMembersResult> {
  const { cacheDir, districtId, programYear } = options
  // Tripwire: validate before the id is interpolated into a path.
  validateDistrictId(districtId)
  const snapshotDate = programYearEndDate(programYear)
  const asOfText = formatReportAsOf(options.asOf)

  const table = parseEducationExportCsv(options.csvText)
  const latest = validateExport(table, districtId, programYear)
  if (latest && options.asOf < latest) {
    throw new Error(
      `--as-of ${options.asOf} is before the latest award date in the export (${latest})`
    )
  }

  const records = countMembersPerClub(table)
  if (records === undefined) {
    // Unreachable: parseEducationExportCsv already required the headers.
    throw new Error('Distinct members per club unavailable — header check')
  }
  const clubIdx = table.headers.indexOf('Club')
  const awardIdx = table.headers.indexOf('Award')
  const memberIdx = table.headers.indexOf('Member')
  const rowsCounted = table.rows.filter(
    r =>
      (r[clubIdx] ?? '') !== '' &&
      isCountedEducationAward(r[awardIdx] ?? '') &&
      memberIdentityKey(r[memberIdx] ?? '') !== null
  ).length

  const filePath = path.join(
    cacheDir,
    'snapshots',
    snapshotDate,
    districtReportsFileName(districtId)
  )
  let existingRaw: string
  try {
    existingRaw = await fs.readFile(filePath, 'utf-8')
  } catch {
    throw new Error(
      `Reports dataset not found at ${filePath} — sync it from GCS first (R2); this command never creates one`
    )
  }
  // Work on the raw object (not the schema-parsed copy) so nothing outside
  // educationMembers is re-shaped or stripped.
  const existing = JSON.parse(existingRaw) as {
    districtId?: unknown
    programYear?: unknown
    sections: Record<string, unknown>
  }
  const check = DistrictReportsDatasetSchema.safeParse(existing)
  if (!check.success) {
    throw new Error(
      `Existing reports file at ${filePath} failed schema validation — refusing to modify: ${check.error.message}`
    )
  }
  if (existing.programYear !== programYear) {
    throw new Error(
      `Existing reports file carries program year ${String(existing.programYear)}, expected ${programYear} — refusing to modify`
    )
  }
  if (existing.districtId !== districtId) {
    throw new Error(
      `Existing reports file carries district ${String(existing.districtId)}, expected ${districtId} — refusing to modify`
    )
  }

  const updated = {
    ...existing,
    sections: {
      ...existing.sections,
      educationMembers: {
        sources: [
          {
            reportType: 'education-achievements',
            tableId: REPORT_GUIDS.education,
            asOf: asOfText,
          },
        ],
        records,
      },
    },
  }
  const valid = DistrictReportsDatasetSchema.safeParse(updated)
  if (!valid.success) {
    throw new Error(
      `Updated dataset failed schema validation: ${valid.error.message}`
    )
  }

  const tmp = `${filePath}.tmp`
  await fs.writeFile(tmp, JSON.stringify(updated, null, 2), 'utf-8')
  await fs.rename(tmp, filePath)

  return {
    districtId,
    programYear,
    snapshotDate,
    path: filePath,
    rowsRead: table.rows.length,
    rowsCounted,
    clubs: records.length,
    membersWithAward: records.reduce((s, r) => s + r.membersWithAward, 0),
  }
}
