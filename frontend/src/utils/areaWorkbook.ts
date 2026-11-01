/**
 * Area workbook CSV (#2428) — one row per club in one area, for the Area
 * Director's monthly visit and council-call table.
 *
 * Reuse only (R7): no analytics rule lives here.
 *   - The club list, health, members, goals, tier and the visit / Club
 *     Success Plan marks are `buildCouncilPack(...).roster`, the area print
 *     pack's own rows (same snapshot, same pinned date).
 *   - Plan due dates are the area's `clubsMissingCsp` (`cspDueDate`).
 *   - The gap to Distinguished is `calculateClubProjection`, formatted by the
 *     Action List's `formatCloseNeeds`.
 *   - Deadlines come from the cited table in `programYearDeadlines.ts`.
 *
 * The roster row type carries no contact or member-level fields, so neither
 * can the workbook. The page owns the program year and the pinned date (R3).
 * Cells are ASCII-only so a spreadsheet opened without a UTF-8 hint reads
 * them unchanged.
 */
import { normalizeClubId } from '@taverns-red/shared-contracts'
import {
  buildCouncilPack,
  type CouncilPackInput,
  type PackClubRow,
} from './councilPack'
import { calculateClubProjection } from './dcpProjections'
import { formatCloseNeeds } from './actionListData'
import { CSP_LOST_ELIGIBILITY } from './cspDeadlines'
import {
  deadlinesForProgramYear,
  type ProgramYearDeadline,
} from './programYearDeadlines'
import type { MissingCspClub } from './divisionStatus'
import { arrayToCSV } from './csvExport'

export const AREA_WORKBOOK_HEADER = [
  'Club Number',
  'Club Name',
  'Division',
  'Area',
  'Health',
  'Members',
  'DCP Goals Met',
  'Distinguished',
  'Missing for Distinguished',
  'Club Visit (Current Round)',
  'Club Success Plan',
  'Next Deadline',
  'Next Deadline For',
] as const

export interface AreaWorkbookScope {
  /** Division id from the route (matched case-insensitively). */
  division: string
  /** Area id from the route (matched case-insensitively). */
  area: string
}

const VISIT_TEXT: Record<NonNullable<PackClubRow['visit']>, string> = {
  done: 'Done',
  missing: 'Not yet',
  'not-held': 'n/a',
}

/** Deadlines tied to a club's own outstanding item, added per club below. */
const CLUB_SPECIFIC = new Set<ProgramYearDeadline['id']>([
  'csp',
  'visits-r1',
  'visits-r2',
])

interface Deadline {
  date: string
  label: string
}

function cspCell(
  row: PackClubRow,
  due: MissingCspClub | undefined,
  tracked: boolean
): string {
  if (!tracked) return 'Not required'
  if (row.csp === 'submitted') return 'Filed'
  if (row.csp === 'not-held') return 'n/a'
  if (row.csp === 'missing' && due) {
    return due.cspOverdue
      ? `Not filed (was due ${due.cspDueDate})`
      : `Not filed (due ${due.cspDueDate})`
  }
  return row.csp === 'missing' ? 'Not filed' : ''
}

/** "Achieved", the lost-eligibility fact, or what is still needed. */
function missingCell(
  row: PackClubRow,
  due: MissingCspClub | undefined,
  needs: () => string
): string {
  if (row.distinguished !== '—') return 'Achieved'
  if (row.csp === 'missing' && due?.cspOverdue) {
    return `Club Success Plan not filed: ${CSP_LOST_ELIGIBILITY}`
  }
  const parts = [needs()]
  if (row.csp === 'missing') parts.push('Club Success Plan')
  return parts.filter(Boolean).join(' + ')
}

/**
 * The header row, then one row per club in the area (the print pack's roster
 * order: by name). Null when the division or area is not in the snapshot.
 */
export function buildAreaWorkbookRows(
  input: CouncilPackInput,
  scope: AreaWorkbookScope
): (string | number)[][] | null {
  const pack = buildCouncilPack(input, scope)
  if (!pack || !pack.areaId) return null
  const area = input.divisions
    .find(d => d.divisionId === pack.divisionId)
    ?.areas.find(a => a.areaId === pack.areaId)
  if (!area) return null

  const dueByClub = new Map(
    area.clubsMissingCsp.map(c => [normalizeClubId(c.clubNumber), c])
  )
  const clubById = new Map(input.clubs.map(c => [c.clubId, c]))
  const asOf = input.snapshotDate.slice(0, 10)
  const yearDeadlines = deadlinesForProgramYear(input.programYear)
  const general = yearDeadlines.filter(
    d => !CLUB_SPECIFIC.has(d.id) && d.date >= asOf
  )
  const visitDeadline = yearDeadlines.find(
    d => d.id === `visits-r${pack.visitRound}`
  )

  const rows = pack.roster.map(row => {
    const due = dueByClub.get(normalizeClubId(row.clubId))
    const trend = clubById.get(row.clubId)

    const missing = missingCell(row, due, () => {
      const gap = trend
        ? calculateClubProjection(trend, input.programYear).gapToDistinguished
        : { members: 0, goals: 0 }
      return formatCloseNeeds({
        clubId: row.clubId,
        clubName: row.clubName,
        divisionId: pack.divisionId,
        areaId: row.areaId,
        membersNeeded: gap.members,
        goalsNeeded: gap.goals,
      })
    })

    const candidates: Deadline[] = [...general]
    if (row.csp === 'missing' && due && !due.cspOverdue) {
      candidates.push({ date: due.cspDueDate, label: 'Club Success Plan due' })
    }
    if (row.visit === 'missing' && visitDeadline) {
      candidates.push(visitDeadline)
    }
    const next = candidates
      .filter(d => d.date >= asOf)
      .sort((a, b) => a.date.localeCompare(b.date))[0]

    return [
      row.clubId,
      row.clubName,
      pack.divisionId,
      row.areaId,
      row.health,
      row.members ?? '',
      row.goals ?? '',
      row.distinguished === '—' ? '' : row.distinguished,
      missing,
      row.visit ? VISIT_TEXT[row.visit] : '',
      cspCell(row, due, pack.csp.tracked),
      next?.date ?? '',
      next?.label ?? '',
    ]
  })

  return [[...AREA_WORKBOOK_HEADER], ...rows]
}

/** Letters and digits only, so a route id can never shape the path. */
function safeId(id: string): string {
  return id.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

/** `area_workbook_district_61_area_B01_2026-10-27.csv`. */
export function areaWorkbookFilename(args: {
  districtId: string
  divisionId: string
  areaId: string
  snapshotDate: string
}): string {
  const date = args.snapshotDate.slice(0, 10).replace(/[^0-9-]/g, '')
  return `area_workbook_district_${safeId(args.districtId)}_area_${safeId(
    args.divisionId
  )}${safeId(args.areaId)}_${date}.csv`
}

/**
 * The workbook as CSV text plus its file name, for the page to hand to
 * `downloadCSV`. Null when the area is not in the snapshot.
 */
export function areaWorkbookCsv(
  districtId: string,
  input: CouncilPackInput,
  scope: AreaWorkbookScope
): { csv: string; filename: string } | null {
  const rows = buildAreaWorkbookRows(input, scope)
  if (!rows) return null
  return {
    csv: arrayToCSV(rows),
    filename: areaWorkbookFilename({
      districtId,
      divisionId: scope.division,
      areaId: scope.area,
      snapshotDate: input.snapshotDate,
    }),
  }
}
