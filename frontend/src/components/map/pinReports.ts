/**
 * Pin colour modes read from the district reports sidecar (#1787, spec
 * §4.2): October and April dues renewals, Club Success Plan, officer list,
 * club coach and education awards per member. The meeting modes (day, how
 * members attend) live in `pinMeeting`. Part of the on-demand `pinExtended`
 * chunk.
 *
 * Absent is not zero (spec §1.3): a missing reports file, section or club row
 * is "Not available for this date" (◌), never "Not received", "No coach" or
 * "No awards yet". The coach mode reads the read-time join on `ClubTrend`
 * (`useDistrictAnalytics`, #1954), not a second parse of the section.
 */
import {
  normalizeClubId,
  type DistrictReportsDataset,
} from '@taverns-red/shared-contracts'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import { parseVerifiedComplete } from '../../utils/clubStatusOverlay'
import {
  SUSPENDED,
  withSuspended,
  type ModeModel,
  type PinCategory,
  type PinShape,
} from './pinModes'

export type ReportsMode =
  'renew-oct' | 'renew-apr' | 'csp' | 'officers' | 'coach' | 'awards'

export const REPORTS_MODES: readonly ReportsMode[] = [
  'renew-oct',
  'renew-apr',
  'csp',
  'officers',
  'coach',
  'awards',
]

export const isReportsMode = (m: string): m is ReportsMode =>
  (REPORTS_MODES as readonly string[]).includes(m)

/** Done · partly · needs action · ineligible (spec §3.3 `compliance`), plus
 *  the April round's "Not open yet". Ineligible is a dark warm grey, not the
 *  spec's `#8C8A82`: that grey sits ΔE 5.8 from "done" green under deutan
 *  simulation, below the validator's 8 (`mapPalette.test.ts`). */
export const COMPLIANCE_FILLS = {
  done: '#2A8F6E',
  partly: '#E0A030',
  action: '#C93D3D',
  ineligible: '#4B4A45',
  notOpen: '#D6D3CC',
} as const

/** Spec §3.3 `coach`. */
export const COACH_FILLS = {
  active: '#882255',
  completed: '#88CCEE',
  none: '#D6D3CC',
} as const

/** Low → high (spec §3.3 `sequential5`). */
export const SEQUENTIAL5 = [
  '#DCE9F5',
  '#9ECAE1',
  '#5A9FCF',
  '#2B6FB0',
  '#0B3F7A',
] as const

/** ◌ The source does not exist for this club on the viewed date. */
export const NOT_AVAILABLE: PinCategory = {
  key: 'na',
  label: 'Not available for this date',
  fill: '#8C8A82',
  shape: 'na',
}

const cat = (
  key: string,
  label: string,
  fill: string,
  shape: PinShape
): PinCategory => ({ key, label, fill, shape })

const RENEWED = cat('renewed', 'Renewed', COMPLIANCE_FILLS.done, 'circle')
const LOW = cat('low', 'Below minimum', COMPLIANCE_FILLS.partly, 'triangle')
const MISSING = cat(
  'missing',
  'Not received',
  COMPLIANCE_FILLS.action,
  'square'
)
const INELIGIBLE = cat(
  'ineligible',
  'Ineligible',
  COMPLIANCE_FILLS.ineligible,
  'diamond'
)
const NOT_OPEN = cat(
  'notOpen',
  'Not open yet',
  COMPLIANCE_FILLS.notOpen,
  'fill0'
)
const SUBMITTED = cat('yes', 'Submitted', COMPLIANCE_FILLS.done, 'circle')
const NOT_SUBMITTED = cat(
  'no',
  'Not submitted',
  COMPLIANCE_FILLS.action,
  'square'
)
const OFFICERS_IN = cat('yes', 'Submitted', COMPLIANCE_FILLS.done, 'circle')
const OFFICERS_OUT = cat(
  'no',
  'Not received',
  COMPLIANCE_FILLS.action,
  'square'
)
const COACH_ACTIVE = cat('active', 'Coach active', COACH_FILLS.active, 'circle')
const COACH_DONE = cat(
  'completed',
  'Coaching complete',
  COACH_FILLS.completed,
  'diamond'
)
const NO_COACH = cat('none', 'No coach', COACH_FILLS.none, 'dot')

const AWARD_RUNGS = [
  'No awards yet',
  'Under 0.25 per member',
  '0.25 to 0.5 per member',
  '0.5 to 1 per member',
  '1 or more per member',
]
const AWARD_KEYS = ['0', 'lt025', '025-05', '05-1', '1plus']
const LEVELS: PinShape[] = ['fill0', 'fill25', 'fill50', 'fill75', 'fill100']

/** Club id (normalised) → value, from one report section's rows. */
function byClub<R, V>(
  rows: readonly R[] | undefined,
  id: (r: R) => string,
  value: (r: R, prev: V | undefined) => V
): Map<string, V> | null {
  if (!rows) return null
  const out = new Map<string, V>()
  for (const r of rows) {
    const k = normalizeClubId(id(r))
    out.set(k, value(r, out.get(k)))
  }
  return out
}

/** 1 July of the program year the viewed date falls in (its logical date). */
function programYearStart(date: string): string {
  const [y = 0, m = 0] = date.split('-').map(Number)
  return `${m >= 7 ? y : y - 1}-07-01`
}

function renewalCategory(status: string, pyStart: string | null): PinCategory {
  const s = status.trim().toLowerCase()
  const verified = parseVerifiedComplete(status)
  if (verified) return pyStart && verified < pyStart ? NOT_OPEN : RENEWED
  if (s.startsWith('low')) return LOW
  if (s.startsWith('ineligible')) return INELIGIBLE
  if (s.includes('not here')) return MISSING
  // A status TI hasn't printed before: say so rather than guess.
  return NOT_AVAILABLE
}

const NOT_SUBMITTED_RE = /^\s*not\s+submitted\s*$/i

interface Rule {
  title: string
  categories: PinCategory[]
  kind: ModeModel['kind']
  pick(c: ClubTrend): PinCategory
  exceptionKey?: string
  note?: string
  /** False when the mode's source is missing for the whole date. */
  available: boolean
}

function rule(
  mode: ReportsMode,
  date: string,
  reports: DistrictReportsDataset | null | undefined
): Rule {
  const id = (c: ClubTrend) => normalizeClubId(c.clubId)
  const sections = reports?.sections
  if (mode === 'renew-oct' || mode === 'renew-apr') {
    const april = mode === 'renew-apr'
    const section = april
      ? sections?.aprilDuesRenewal
      : sections?.octoberDuesRenewal
    const rows = byClub(
      section?.records,
      r => r.club,
      r => r.renewalStatus
    )
    // Only April's round can be last year's: on the viewed PY's dates
    // before it opens, every "verified" row is the previous April.
    const pyStart = april && date ? programYearStart(date) : null
    return {
      title: april ? 'April renewals' : 'October renewals',
      kind: 'status',
      categories: april
        ? [RENEWED, LOW, MISSING, INELIGIBLE, NOT_OPEN]
        : [RENEWED, LOW, MISSING, INELIGIBLE],
      pick: c => {
        const s = rows?.get(id(c))
        return s === undefined ? NOT_AVAILABLE : renewalCategory(s, pyStart)
      },
      exceptionKey: 'missing',
      ...(april
        ? { note: 'Not open yet: renewed for last April’s round only.' }
        : {}),
      available: rows !== null,
    }
  }
  if (mode === 'csp') {
    const rows = byClub(
      sections?.clubSuccessPlan?.records,
      r => r.clubNumber,
      r => r.submissionDate
    )
    return {
      title: 'Club Success Plan',
      kind: 'status',
      categories: [SUBMITTED, NOT_SUBMITTED],
      // The report wins over the CSV flag (spec §4.2: club 6871192).
      pick: c => {
        const d = rows?.get(id(c))
        if (d !== undefined && d.trim())
          return NOT_SUBMITTED_RE.test(d) ? NOT_SUBMITTED : SUBMITTED
        if (c.cspSubmitted === undefined) return NOT_AVAILABLE
        return c.cspSubmitted ? SUBMITTED : NOT_SUBMITTED
      },
      exceptionKey: 'no',
      available: true,
    }
  }
  if (mode === 'officers') {
    const rows = byClub(
      sections?.officerList?.records,
      r => r.club,
      r => r.officerListSubmitted
    )
    return {
      title: 'Officer list',
      kind: 'status',
      categories: [OFFICERS_IN, OFFICERS_OUT],
      pick: c => {
        const v = rows?.get(id(c))
        return v === undefined ? NOT_AVAILABLE : v ? OFFICERS_IN : OFFICERS_OUT
      },
      exceptionKey: 'no',
      available: rows !== null,
    }
  }
  if (mode === 'coach') {
    // "No coach" needs the section present: absent from it is a fact,
    // absent with it is unknown.
    const present = Boolean(sections?.coaches)
    return {
      title: 'Club coach',
      kind: 'status',
      categories: [COACH_ACTIVE, COACH_DONE, NO_COACH],
      pick: c =>
        c.coach?.status === 'active'
          ? COACH_ACTIVE
          : c.coach?.status === 'completed'
            ? COACH_DONE
            : present
              ? NO_COACH
              : NOT_AVAILABLE,
      exceptionKey: 'active',
      available: present,
    }
  }
  // Awards per member.
  const totals = byClub<{ club: string; achievementCount: number }, number>(
    sections?.educationAchievements?.records,
    r => r.club,
    (r, prev) => (prev ?? 0) + r.achievementCount
  )
  const rungs = AWARD_KEYS.map((key, i) =>
    cat(key, AWARD_RUNGS[i]!, SEQUENTIAL5[i]!, LEVELS[i]!)
  )
  return {
    title: 'Education awards per member (PYTD)',
    kind: 'ordinal',
    categories: rungs,
    pick: c => {
      const n = c.membershipTrend[c.membershipTrend.length - 1]?.count
      if (!totals || !n) return NOT_AVAILABLE
      const r = (totals.get(id(c)) ?? 0) / n
      const i = r === 0 ? 0 : r < 0.25 ? 1 : r < 0.5 ? 2 : r < 1 ? 3 : 4
      return rungs[i]!
    },
    note: 'Every award counts, Pathways and legacy (TI education ledger).',
    available: totals !== null,
  }
}

/** `date` is the viewed snapshot date and `reports` its sidecar, both passed
 *  down by the page (R3). */
export function reportsModel(
  mode: ReportsMode,
  date: string,
  reports: DistrictReportsDataset | null | undefined
): ModeModel {
  const r = rule(mode, date, reports)
  const note = r.available
    ? r.note
    : `${r.title} is not available for ${date || 'this date'}.`
  return {
    mode,
    title: r.title,
    kind: r.kind,
    categories: [...r.categories, NOT_AVAILABLE, SUSPENDED],
    categoryOf: withSuspended(r.pick),
    isDashed: () => false,
    facet: { param: mode, valueOf: c => c.key },
    ...(r.exceptionKey ? { exceptionKey: r.exceptionKey } : {}),
    ...(note ? { note } : {}),
  }
}
