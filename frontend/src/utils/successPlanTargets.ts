/**
 * District Success Plan targets (#2297): the leader's own numbers for the
 * plan's goal areas, carried only in a shareable `?targets=` link.
 *
 * The goal areas are the District Success Plan's own headings — "Membership
 * Payments Growth", "Club Growth" and "Distinguished Clubs" (TI Item 431,
 * District Strategies Guide, Rev. 05/2025, pp.5–6). Each maps to one of the
 * three tiered KPIs the Overview already shows: payments, paid clubs and
 * Distinguished clubs.
 *
 * Pure: no React. Nothing is saved anywhere — no server, no localStorage.
 * The grammar follows the realignment plan's `?plan=` (#1819): groups joined
 * by `_`, fields by `-`, sorted so the same targets always give the same
 * link, and every token whitelisted on decode (Lessons 124/144).
 *
 *   c-105_d-60_p-4500_py-2026
 *
 * `py` binds the targets to one program year (its start year), so an old
 * link never overlays the wrong year.
 */

export const TARGETS_PARAM = 'targets'

export type SuccessPlanGoalKey = 'payments' | 'paidClubs' | 'distinguishedClubs'

/** The goals a plan sets. A goal left out is not overlaid. */
export type SuccessPlanGoals = Partial<Record<SuccessPlanGoalKey, number>>

export interface SuccessPlanTargets {
  /** Program-year start year (2026 for 2026-2027). */
  programYear: number
  goals: SuccessPlanGoals
}

const GOAL_CODES: Record<SuccessPlanGoalKey, string> = {
  paidClubs: 'c',
  distinguishedClubs: 'd',
  payments: 'p',
}
const CODE_GOALS = new Map(
  Object.entries(GOAL_CODES).map(([goal, code]) => [
    code,
    goal as SuccessPlanGoalKey,
  ])
)
const PY_CODE = 'py'

// Whitelists (the link is URL-seedable).
const VALUE_RE = /^[1-9]\d{0,5}$/
const PY_RE = /^20\d{2}$/
/** Far above any real link (~30 chars); a longer one is not ours. */
const MAX_RAW_LENGTH = 120

export const MAX_TARGET = 999_999

export function encodeTargets(targets: SuccessPlanTargets): string {
  const groups: string[] = []
  for (const [goal, code] of Object.entries(GOAL_CODES)) {
    const value = targets.goals[goal as SuccessPlanGoalKey]
    if (value !== undefined && VALUE_RE.test(String(value))) {
      groups.push(`${code}-${value}`)
    }
  }
  if (groups.length === 0) return ''
  groups.push(`${PY_CODE}-${targets.programYear}`)
  return groups.sort().join('_')
}

/**
 * Parse `?targets=`. Malformed and unknown groups are dropped; without a
 * valid program year or any valid goal the whole link is ignored (null).
 */
export function decodeTargets(raw: string | null): SuccessPlanTargets | null {
  if (!raw || raw.length > MAX_RAW_LENGTH) return null
  let programYear: number | null = null
  const goals: SuccessPlanGoals = {}
  for (const group of raw.split('_')) {
    const parts = group.split('-')
    if (parts.length !== 2) continue
    const [code, value] = parts as [string, string]
    if (code === PY_CODE) {
      if (PY_RE.test(value)) programYear = Number(value)
      continue
    }
    const goal = CODE_GOALS.get(code)
    if (!goal || !VALUE_RE.test(value)) continue
    goals[goal] = Number(value)
  }
  if (programYear === null || Object.keys(goals).length === 0) return null
  return { programYear, goals }
}

/** The goals to overlay on a page showing `programYear` — or none. */
export function goalsForProgramYear(
  targets: SuccessPlanTargets | null,
  programYear: number
): SuccessPlanGoals | null {
  if (!targets || targets.programYear !== programYear) return null
  return targets.goals
}

/** A typed target: a whole number from 1 to 999,999 (commas allowed). */
export function parseTargetInput(input: string): number | undefined {
  const cleaned = input.trim().replace(/,/g, '')
  if (!VALUE_RE.test(cleaned)) return undefined
  return Number(cleaned)
}
