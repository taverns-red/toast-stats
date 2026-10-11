import {
  clubIdsMatch,
  type DistrictReportsDataset,
} from '@taverns-red/shared-contracts'
import { cspDueDate, isCspOverdue } from '@taverns-red/analytics-core'
import { formatDisplayDate } from './dateFormatting'
import { formatCspDueDate } from './cspDeadlines'

/**
 * #1790 — the club page's Compliance panel: officer list, October and
 * April dues, Club Success Plan (with its #1565 due date), round 1/2 club
 * visits, and the coach. Every row states its source and that source's
 * as-of date. A row whose source is absent for the viewed date says "Not
 * available for this date" rather than guessing.
 *
 * Nothing reads a clock: program year and snapshot date are the page's (R3),
 * so a pinned historical date renders what was true on that date.
 */
export type ComplianceState = 'ok' | 'warn' | 'bad' | 'neutral' | 'unknown'

export interface ComplianceRow {
  key: string
  label: string
  state: ComplianceState
  value: string
  /** "<report> · <as-of>", or '' when unavailable. */
  source: string
}

export interface ComplianceInput {
  reports: DistrictReportsDataset | null | undefined
  clubId: string
  /** The club's raw `divisionPerformance` row from the dashboard snapshot. */
  divisionRecord: Record<string, string | number | null> | null
  charterDate: string | undefined
  /** "YYYY-YYYY", from the page's controls (R3). */
  programYear: string
  /** "YYYY-MM-DD", the page's pinned snapshot date (R3). */
  snapshotDate: string
}

export interface ClubCoachSummary {
  status: 'active' | 'awarded' | 'none'
  label: string
  source: string
}

const UNAVAILABLE = 'Not available for this date'

/** "05/25/2026" → "2026-05-25"; null if not that shape. */
function usDateToIso(text: string): string | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(text)
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null
}

function source(
  name: string,
  section: { sources: { asOf: string }[] } | undefined
): string {
  const asOf = section?.sources[0]?.asOf ?? ''
  return asOf ? `${name} · ${asOf}` : name
}

function unavailable(key: string, label: string): ComplianceRow {
  return { key, label, state: 'unknown', value: UNAVAILABLE, source: '' }
}

function officerListRow(input: ComplianceInput): ComplianceRow {
  const key = 'officerList'
  const label = 'Officer list'
  const section = input.reports?.sections.officerList
  if (!section) return unavailable(key, label)
  const src = source('Officer list report', section)
  const rec = section.records.find(r => clubIdsMatch(r.club, input.clubId))
  if (!rec)
    return { key, label, state: 'neutral', value: 'No record', source: src }
  const iso = usDateToIso(rec.listStatus)
  if (/^received/i.test(rec.listStatus) && iso) {
    return {
      key,
      label,
      state: 'ok',
      value: `Received ${formatDisplayDate(iso)}`,
      source: src,
    }
  }
  if (/not here/i.test(rec.listStatus)) {
    return { key, label, state: 'warn', value: 'Not received', source: src }
  }
  return { key, label, state: 'neutral', value: rec.listStatus, source: src }
}

/**
 * Dues. A "Verified complete" record counts for this program year only if
 * it was verified inside the window that period's payments fall in — the
 * report keeps last period's verification until the new one arrives (D61,
 * October 2026: the April report still shows January 2026). Before the April
 * period opens (1 January of the PY's second year) April dues are simply
 * not due yet.
 */
function duesRow(
  input: ComplianceInput,
  season: 'october' | 'april'
): ComplianceRow {
  const key = season === 'october' ? 'octoberDues' : 'aprilDues'
  const label = season === 'october' ? 'October dues' : 'April dues'
  const section =
    season === 'october'
      ? input.reports?.sections.octoberDuesRenewal
      : input.reports?.sections.aprilDuesRenewal
  if (!section) return unavailable(key, label)
  const src = source('Dues renewal report', section)

  const startYear = Number.parseInt(input.programYear.slice(0, 4), 10)
  if (season === 'april' && input.snapshotDate < `${startYear + 1}-01-01`) {
    return {
      key,
      label,
      state: 'neutral',
      value: `Not yet due (April ${startYear + 1})`,
      source: src,
    }
  }
  const windowStart =
    season === 'october' ? `${startYear}-06-01` : `${startYear}-12-01`

  const rec = section.records.find(r => clubIdsMatch(r.club, input.clubId))
  if (!rec)
    return { key, label, state: 'neutral', value: 'No record', source: src }
  const status = rec.renewalStatus

  if (/^verified complete/i.test(status)) {
    const iso = usDateToIso(status)
    if (iso && iso >= windowStart) {
      return {
        key,
        label,
        state: 'ok',
        value: `Verified ${formatDisplayDate(iso)}`,
        source: src,
      }
    }
    return { key, label, state: 'warn', value: 'Not received', source: src }
  }
  if (/^ineligible/i.test(status)) {
    return {
      key,
      label,
      state: 'bad',
      value: 'Minimum not yet met (ineligible)',
      source: src,
    }
  }
  if (/^low/i.test(status)) {
    return {
      key,
      label,
      state: 'warn',
      value: 'Minimum not yet met',
      source: src,
    }
  }
  if (/not here/i.test(status)) {
    return { key, label, state: 'warn', value: 'Not received', source: src }
  }
  return { key, label, state: 'neutral', value: status, source: src }
}

function cspRow(input: ComplianceInput): ComplianceRow {
  const key = 'csp'
  const label = 'Club Success Plan'
  const section = input.reports?.sections.clubSuccessPlan
  if (!section) return unavailable(key, label)
  const src = source('Club Success Plan report', section)
  const rec = section.records.find(r =>
    clubIdsMatch(r.clubNumber, input.clubId)
  )
  if (!rec)
    return { key, label, state: 'neutral', value: 'No record', source: src }

  if (!/not submitted/i.test(rec.submissionDate) && rec.submissionDate.trim()) {
    return {
      key,
      label,
      state: 'ok',
      value: `Submitted ${rec.submissionDate.trim()}`,
      source: src,
    }
  }
  const due = cspDueDate({ charterDate: input.charterDate }, input.programYear)
  if (due === null) {
    return { key, label, state: 'ok', value: 'Automatic credit', source: src }
  }
  return isCspOverdue(due, input.snapshotDate)
    ? {
        key,
        label,
        state: 'bad',
        value: `Not submitted — deadline ${formatCspDueDate(due)} passed`,
        source: src,
      }
    : {
        key,
        label,
        state: 'warn',
        value: `Not submitted — due ${formatCspDueDate(due)}`,
        source: src,
      }
}

/** R1 → `Nov Visit award`; R2 → `May Visit award` (or the lowercase variant, #268). */
function visitRow(input: ComplianceInput, round: 1 | 2): ComplianceRow {
  const key = `visitR${round}`
  const label = `Round ${round} club visit`
  const rec = input.divisionRecord
  if (!rec) return unavailable(key, label)
  const fields =
    round === 1 ? ['Nov Visit award'] : ['May Visit award', 'May visit award']
  const raw = fields.map(f => rec[f]).find(v => v !== undefined && v !== null)
  const src = `Dashboard · ${formatDisplayDate(input.snapshotDate)}`
  if (raw === undefined) {
    return { ...unavailable(key, label) }
  }
  return Number(raw) >= 1
    ? { key, label, state: 'ok', value: 'Completed', source: src }
    : { key, label, state: 'neutral', value: 'Not yet recorded', source: src }
}

export function summarizeClubCompliance(
  input: ComplianceInput
): ComplianceRow[] {
  return [
    officerListRow(input),
    duesRow(input, 'october'),
    duesRow(input, 'april'),
    cspRow(input),
    visitRow(input, 1),
    visitRow(input, 2),
  ]
}

/**
 * The club's coach (codes, status and dates only — the report's names are
 * dropped at parse). Null when the date has no coaches report.
 */
export function summarizeClubCoach(
  reports: DistrictReportsDataset | null | undefined,
  clubId: string
): ClubCoachSummary | null {
  const section = reports?.sections.coaches
  if (!section) return null
  const src = source('Coaches report', section)
  const records = section.records.filter(r => clubIdsMatch(r.club, clubId))
  const active = records.find(r => r.activeCoach)
  const pick = active ?? records[0]
  if (!pick) return { status: 'none', label: 'No coach', source: src }
  const iso = usDateToIso(pick.beginDate)
  const date = iso ? formatDisplayDate(iso) : pick.beginDate
  return active
    ? { status: 'active', label: `Active since ${date}`, source: src }
    : {
        status: 'awarded',
        label: `Coach award earned (began ${date})`,
        source: src,
      }
}
