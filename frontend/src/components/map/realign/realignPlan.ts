/**
 * Realignment sandbox plan (#1819): a proposed club → area assignment, its
 * compact URL encoding, and the balance metrics it drives.
 *
 * Pure: no React, no MapLibre. Nothing is saved anywhere — the plan lives
 * in `?plan=` so a link shares it. Metrics use only fields the analytics
 * snapshot already has: the club's latest membership count, its health
 * classification and its (possibly provisional) Distinguished level.
 *
 * Privacy: the CSV carries names, numbers and assignments only — never
 * email, phone or meeting details.
 */
import type { ClubTrend } from '../../../hooks/useDistrictAnalytics'

export interface AreaRef {
  divisionId: string
  areaId: string
}

/** clubId → proposed area. Only real moves are kept. */
export type Plan = ReadonlyMap<string, AreaRef>

export const PLAN_PARAM = 'plan'

/** The club-count norm an area is balanced against. */
export const AREA_NORM = { min: 4, max: 6 } as const

// `?plan=` is URL-seedable: whitelist every token (Lessons 124/144).
const TERRITORY_RE = /^[A-Za-z0-9]{1,8}$/
const CLUB_RE = /^\d{1,10}$/

const byNumber = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true })

export const areaCode = (r: AreaRef) => `${r.divisionId}${r.areaId}`

const sameArea = (c: ClubTrend, r: AreaRef) =>
  c.divisionId === r.divisionId && c.areaId === r.areaId

/**
 * `A-01-7005_A-02-3048.7006`: groups joined by `_`, one per target area
 * (`division-area-clubs`), club ids joined by `.`. Only characters that
 * URLSearchParams leaves alone, so a shared link stays readable. Sorted,
 * so the same plan always gives the same link.
 */
export function encodePlan(plan: Plan): string {
  const groups = new Map<string, { ref: AreaRef; ids: string[] }>()
  for (const [id, ref] of plan) {
    const key = `${ref.divisionId}-${ref.areaId}`
    const g = groups.get(key) ?? { ref, ids: [] }
    g.ids.push(id)
    groups.set(key, g)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => byNumber(a, b))
    .map(([key, g]) => `${key}-${g.ids.sort(byNumber).join('.')}`)
    .join('_')
}

/** Parse `?plan=`, dropping anything malformed, unknown or a no-op. */
export function decodePlan(
  raw: string | null,
  clubs: readonly ClubTrend[]
): Plan {
  const plan = new Map<string, AreaRef>()
  if (!raw) return plan
  const byId = new Map(clubs.map(c => [c.clubId, c]))
  for (const group of raw.split('_')) {
    const parts = group.split('-')
    if (parts.length !== 3) continue
    const [divisionId, areaId, ids] = parts as [string, string, string]
    if (!TERRITORY_RE.test(divisionId) || !TERRITORY_RE.test(areaId)) continue
    for (const id of ids.split('.')) {
      if (!CLUB_RE.test(id)) continue
      const club = byId.get(id)
      if (!club) continue
      const ref = { divisionId, areaId }
      plan.delete(id)
      if (!sameArea(club, ref)) plan.set(id, ref)
    }
  }
  return plan
}

/** Move a club; moving it back to its current area removes the move. */
export function setMove(plan: Plan, club: ClubTrend, to: AreaRef): Plan {
  const next = new Map(plan)
  if (sameArea(club, to)) next.delete(club.clubId)
  else next.set(club.clubId, { divisionId: to.divisionId, areaId: to.areaId })
  return next
}

/** The clubs as the plan would have them. Unmoved clubs are the same objects. */
export function applyPlan(
  clubs: readonly ClubTrend[],
  plan: Plan
): ClubTrend[] {
  if (plan.size === 0) return [...clubs]
  const divisionNames = new Map<string, string>()
  const areaNames = new Map<string, string>()
  for (const c of clubs) {
    if (c.divisionName) divisionNames.set(c.divisionId, c.divisionName)
    if (c.areaName) areaNames.set(areaCode(c), c.areaName)
  }
  return clubs.map(c => {
    const to = plan.get(c.clubId)
    if (!to) return c
    return {
      ...c,
      divisionId: to.divisionId,
      divisionName:
        divisionNames.get(to.divisionId) ?? `Division ${to.divisionId}`,
      areaId: to.areaId,
      areaName: areaNames.get(areaCode(to)) ?? `Area ${to.areaId}`,
    }
  })
}

export interface HealthMix {
  thriving: number
  vulnerable: number
  intervention: number
}

export interface UnitMetrics {
  /** `A01` for an area, `A` for a division. */
  code: string
  label: string
  divisionId: string
  areaId?: string
  clubs: number
  members: number
  health: HealthMix
  /** Clubs at Distinguished or above, provisional (pre-April) included. */
  distinguished: number
  /** Divisions only: how many areas. */
  areas?: number
}

const latestMembers = (c: ClubTrend) =>
  c.membershipTrend[c.membershipTrend.length - 1]?.count ?? 0

const empty = (
  code: string,
  label: string,
  divisionId: string,
  areaId?: string
): UnitMetrics => ({
  code,
  label,
  divisionId,
  ...(areaId === undefined ? {} : { areaId }),
  clubs: 0,
  members: 0,
  health: { thriving: 0, vulnerable: 0, intervention: 0 },
  distinguished: 0,
})

function add(m: UnitMetrics, c: ClubTrend) {
  m.clubs++
  m.members += latestMembers(c)
  if (c.currentStatus === 'thriving') m.health.thriving++
  else if (c.currentStatus === 'vulnerable') m.health.vulnerable++
  else m.health.intervention++
  if (c.distinguishedLevel !== 'NotDistinguished') m.distinguished++
}

/** Per-area and per-division totals, in code order. */
export function balanceMetrics(clubs: readonly ClubTrend[]): {
  areas: UnitMetrics[]
  divisions: UnitMetrics[]
} {
  const areas = new Map<string, UnitMetrics>()
  const divisions = new Map<string, UnitMetrics>()
  for (const c of clubs) {
    const code = areaCode(c)
    let a = areas.get(code)
    if (!a) {
      a = empty(code, c.areaName || `Area ${c.areaId}`, c.divisionId, c.areaId)
      areas.set(code, a)
    }
    add(a, c)
    let d = divisions.get(c.divisionId)
    if (!d) {
      d = empty(
        c.divisionId,
        c.divisionName || `Division ${c.divisionId}`,
        c.divisionId
      )
      d.areas = 0
      divisions.set(c.divisionId, d)
    }
    add(d, c)
  }
  for (const a of areas.values()) {
    const d = divisions.get(a.divisionId)!
    d.areas = (d.areas ?? 0) + 1
  }
  const sorted = (m: Map<string, UnitMetrics>) =>
    [...m.values()].sort((x, y) => byNumber(x.code, y.code))
  return { areas: sorted(areas), divisions: sorted(divisions) }
}

export function normStatus(clubCount: number): 'under' | 'within' | 'over' {
  if (clubCount < AREA_NORM.min) return 'under'
  if (clubCount > AREA_NORM.max) return 'over'
  return 'within'
}

const outsideNorm = (areas: UnitMetrics[]) =>
  areas.filter(a => normStatus(a.clubs) !== 'within').length

export interface PlanSummary {
  moved: number
  outsideNorm: { current: number; proposed: number }
  areas: { current: number; proposed: number }
}

export function planSummary(
  clubs: readonly ClubTrend[],
  plan: Plan
): PlanSummary {
  const current = balanceMetrics(clubs).areas
  const proposed = balanceMetrics(applyPlan(clubs, plan)).areas
  return {
    moved: plan.size,
    outsideNorm: {
      current: outsideNorm(current),
      proposed: outsideNorm(proposed),
    },
    areas: { current: current.length, proposed: proposed.length },
  }
}

export interface AreaOption extends AreaRef {
  label: string
  isNew: boolean
}

/** Every area a club can be moved to: today's, plus ones the plan created. */
export function areaOptions(
  clubs: readonly ClubTrend[],
  plan: Plan
): AreaOption[] {
  const seen = new Map<string, AreaOption>()
  for (const c of clubs) {
    const code = areaCode(c)
    if (!seen.has(code))
      seen.set(code, {
        divisionId: c.divisionId,
        areaId: c.areaId,
        label: code,
        isNew: false,
      })
  }
  for (const ref of plan.values()) {
    const code = areaCode(ref)
    if (!seen.has(code))
      seen.set(code, { ...ref, label: `${code} (new)`, isNew: true })
  }
  return [...seen.values()].sort(
    (a, b) =>
      byNumber(a.divisionId, b.divisionId) || byNumber(a.areaId, b.areaId)
  )
}

/**
 * The id for a new area in a division: the next number after the
 * division's highest that no area in the district (or the plan) uses yet,
 * at the same width (area numbers are district-unique, e.g. `13`).
 */
export function newAreaId(
  divisionId: string,
  clubs: readonly ClubTrend[],
  plan: Plan
): string {
  const used = new Set(clubs.map(c => c.areaId))
  for (const r of plan.values()) used.add(r.areaId)
  const mine = [
    ...clubs.filter(c => c.divisionId === divisionId).map(c => c.areaId),
    ...[...plan.values()]
      .filter(r => r.divisionId === divisionId)
      .map(r => r.areaId),
  ].filter(id => /^\d+$/.test(id))
  const width = Math.max(2, ...mine.map(id => id.length))
  let n = mine.length ? Math.max(...mine.map(Number)) + 1 : 1
  while (used.has(String(n).padStart(width, '0'))) n++
  return String(n).padStart(width, '0')
}

/** The proposed assignment as CSV rows (header first), in club-name order. */
export function planCsvRows(
  clubs: readonly ClubTrend[],
  plan: Plan
): (string | number)[][] {
  const header = [
    'Club number',
    'Club name',
    'Current division',
    'Current area',
    'Proposed division',
    'Proposed area',
    'Moved',
    'Members',
    'Club health',
    'Distinguished level',
  ]
  const rows = [...clubs]
    .sort((a, b) => a.clubName.localeCompare(b.clubName))
    .map(c => {
      const to = plan.get(c.clubId) ?? c
      return [
        c.clubId,
        c.clubName,
        c.divisionId,
        areaCode(c),
        to.divisionId,
        areaCode(to),
        plan.has(c.clubId) ? 'yes' : 'no',
        latestMembers(c),
        c.currentStatus,
        c.distinguishedLevel,
      ]
    })
  return [header, ...rows]
}
