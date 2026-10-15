/**
 * District Education page model (#1793, epic #1781).
 *
 * Ledger only (Ron, 2026-10-11): every award counted here is a row of the
 * reports dataset's `educationAchievements` — the daily Education
 * Achievements report for the current program year, the TI archive on a
 * prior year's June 30 snapshot. No dashboard-CSV proxy. Members with an
 * award and Triple Crown come from the same dataset's `educationMembers` and
 * `tripleCrown` sections; base members from the analytics club list.
 *
 * Counting follows the #1801 rollup, so this page and the rollup agree:
 * - every award counts in `totals.awards` = pathways + legacy + dtm + other;
 * - DTM is counted once under its own code;
 * - the level × path matrix is Pathways only.
 *
 * Absent is never 0 (#1757): a missing dataset, a missing education section
 * or a dataset for another program year is `not-available`; a member or
 * Triple Crown section the dataset lacks is `null`; base members are `null`
 * when the club list carries no base. A canonical path or a club-list area
 * with no award while the ledger is present is a real 0.
 *
 * Divisions and areas are derived from ONE merged set — the club list plus
 * the ledger rows — so the two rollups can never disagree on membership
 * (Lesson: derive sibling aggregate blocks from one merged entity set).
 */
import {
  awardCodeFromAward,
  educationAwardProgram,
  normalizeClubId,
  pathwaysLevel,
  type DistrictReportsDataset,
} from '@taverns-red/shared-contracts'

/** The 11 Pathways paths, in alphabetical order of their code. */
export const PATHWAYS_PATHS: readonly { code: string; title: string }[] = [
  { code: 'DL', title: 'Dynamic Leadership' },
  { code: 'EC', title: 'Effective Coaching' },
  { code: 'EH', title: 'Engaging Humor' },
  { code: 'IP', title: 'Innovative Planning' },
  { code: 'LD', title: 'Leadership Development' },
  { code: 'MS', title: 'Motivational Strategies' },
  { code: 'PI', title: 'Persuasive Influence' },
  { code: 'PM', title: 'Presentation Mastery' },
  { code: 'SR', title: 'Strategic Relationships' },
  { code: 'TC', title: 'Team Collaboration' },
  { code: 'VC', title: 'Visionary Communication' },
]

export interface EducationClub {
  clubId: string
  clubName: string
  divisionId: string
  areaId: string
  membershipBase?: number
}

export interface EducationTotals {
  awards: number
  pathways: number
  legacy: number
  dtm: number
  other: number
}

export interface EducationLevelRow {
  /** `L1`…`L5`, or `DTM`. */
  key: string
  count: number
  /** Paths with an award at this level, most first. Empty for DTM. */
  byPath: { path: string; count: number }[]
}

export interface EducationPathRow {
  path: string
  title: string
  /** Awards at [L1, L2, L3, L4, L5]. */
  levels: [number, number, number, number, number]
  total: number
}

export interface EducationRollupRow {
  /** Stable key: `A` for a division, `A-04` for an area. */
  key: string
  /** Division letter, or the area id within its division. */
  id: string
  divisionId: string
  awards: number
  pathways: number
  legacy: number
  dtm: number
  clubsWithAward: number
  /** `null` = not measured (no `educationMembers` section). */
  membersWithAward: number | null
  /** `null` = the club list carries no base for this unit. */
  baseMembers: number | null
  awardsPerBaseMember: number | null
}

export type DistrictEducationUnavailableReason =
  'no-reports' | 'no-education-section' | 'program-year-mismatch'

export type DistrictEducation =
  | { status: 'not-available'; reason: DistrictEducationUnavailableReason }
  | {
      status: 'available'
      totals: EducationTotals
      kpis: {
        awards: number
        membersWithAward: number | null
        dtms: number
        tripleCrownAchievers: number | null
        baseMembers: number | null
        awardsPerBaseMember: number | null
      }
      levels: EducationLevelRow[]
      paths: EducationPathRow[]
      /** Pathways awards per level, summed over paths. */
      levelTotals: [number, number, number, number, number]
      legacyByCode: { code: string; count: number }[]
      otherByCode: { code: string; count: number }[]
      divisions: EducationRollupRow[]
      areas: EducationRollupRow[]
      source: { reportType: string; asOf: string }
    }

export interface BuildDistrictEducationInput {
  reports: DistrictReportsDataset | null
  /** The page's selected program year label, e.g. `2026-2027` (R3). */
  programYear: string
  clubs: readonly EducationClub[]
}

/** `Presentation Mastery` from `PM1Presentation Mastery Level 1`. */
export function pathTitleFromAward(award: string, path: string): string {
  return award
    .trim()
    .replace(new RegExp(`^${path}[1-5]`), '')
    .replace(/\s*Level\s*[1-5]\s*$/i, '')
    .trim()
}

/** Area ids appear as `4` in the ledger and `04` in the club list. */
const normalizeArea = (area: string): string => {
  const t = area.trim()
  return /^\d+$/.test(t) ? String(Number(t)).padStart(2, '0') : t
}

const byCountThenCode = (
  a: { code: string; count: number },
  b: { code: string; count: number }
) => b.count - a.count || a.code.localeCompare(b.code)

interface Unit {
  key: string
  id: string
  divisionId: string
  totals: EducationTotals
  clubs: Set<string>
  members: number
  base: number
  hasBase: boolean
}

const newUnit = (key: string, id: string, divisionId: string): Unit => ({
  key,
  id,
  divisionId,
  totals: { awards: 0, pathways: 0, legacy: 0, dtm: 0, other: 0 },
  clubs: new Set(),
  members: 0,
  base: 0,
  hasBase: false,
})

export function buildDistrictEducation({
  reports,
  programYear,
  clubs,
}: BuildDistrictEducationInput): DistrictEducation {
  if (!reports) return { status: 'not-available', reason: 'no-reports' }
  const achievements = reports.sections.educationAchievements
  if (!achievements) {
    return { status: 'not-available', reason: 'no-education-section' }
  }
  if (reports.programYear !== programYear) {
    return { status: 'not-available', reason: 'program-year-mismatch' }
  }
  const membersSection = reports.sections.educationMembers

  // One merged entity set: club → (division, area), club list first.
  const location = new Map<string, { division: string; area: string }>()
  const divisions = new Map<string, Unit>()
  const areas = new Map<string, Unit>()
  const unitsFor = (division: string, area: string) => {
    const div =
      divisions.get(division) ??
      divisions
        .set(division, newUnit(division, division, division))
        .get(division)!
    const areaKey = `${division}-${area}`
    const ar =
      areas.get(areaKey) ??
      areas.set(areaKey, newUnit(areaKey, area, division)).get(areaKey)!
    return [div, ar] as const
  }

  for (const c of clubs) {
    const division = c.divisionId.trim()
    const area = normalizeArea(c.areaId)
    location.set(normalizeClubId(c.clubId), { division, area })
    const base = c.membershipBase
    for (const u of unitsFor(division, area)) {
      if (typeof base === 'number') {
        u.base += base
        u.hasBase = true
      }
    }
  }

  const totals: EducationTotals = {
    awards: 0,
    pathways: 0,
    legacy: 0,
    dtm: 0,
    other: 0,
  }
  const cells = new Map<string, [number, number, number, number, number]>()
  const titles = new Map<string, string>()
  const legacy = new Map<string, number>()
  const other = new Map<string, number>()

  for (const r of achievements.records) {
    const n = r.achievementCount
    if (n <= 0) continue
    const clubKey = normalizeClubId(r.club)
    const loc = location.get(clubKey) ?? {
      division: r.division.trim(),
      area: normalizeArea(r.area),
    }
    if (!location.has(clubKey)) location.set(clubKey, loc)
    const units = unitsFor(loc.division, loc.area)

    const code = awardCodeFromAward(r.award)
    const program = educationAwardProgram(code)
    totals.awards += n
    for (const u of units) {
      u.totals.awards += n
      u.clubs.add(clubKey)
    }
    switch (program) {
      case 'Pathways': {
        const lv = pathwaysLevel(code)!
        const row =
          cells.get(lv.path) ??
          cells.set(lv.path, [0, 0, 0, 0, 0]).get(lv.path)!
        row[lv.level - 1] = (row[lv.level - 1] ?? 0) + n
        if (!titles.has(lv.path)) {
          titles.set(lv.path, pathTitleFromAward(r.award, lv.path))
        }
        totals.pathways += n
        for (const u of units) u.totals.pathways += n
        break
      }
      case 'Legacy':
        totals.legacy += n
        legacy.set(code, (legacy.get(code) ?? 0) + n)
        for (const u of units) u.totals.legacy += n
        break
      case 'DTM':
        totals.dtm += n
        for (const u of units) u.totals.dtm += n
        break
      case 'Other':
        totals.other += n
        other.set(code, (other.get(code) ?? 0) + n)
        for (const u of units) u.totals.other += n
        break
    }
  }

  let membersWithAward: number | null = null
  if (membersSection) {
    membersWithAward = 0
    for (const r of membersSection.records) {
      membersWithAward += r.membersWithAward
      const loc = location.get(normalizeClubId(r.club))
      if (!loc) continue
      for (const u of unitsFor(loc.division, loc.area)) {
        u.members += r.membersWithAward
      }
    }
  }

  const canonical = new Set(PATHWAYS_PATHS.map(p => p.code))
  const extraPaths = [...cells.keys()]
    .filter(p => !canonical.has(p))
    .sort((a, b) => a.localeCompare(b))
  const paths: EducationPathRow[] = [
    ...PATHWAYS_PATHS.map(p => ({ code: p.code, title: p.title })),
    ...extraPaths.map(code => ({ code, title: titles.get(code) ?? code })),
  ].map(({ code, title }) => {
    const levels = [...(cells.get(code) ?? [0, 0, 0, 0, 0])] as [
      number,
      number,
      number,
      number,
      number,
    ]
    return {
      path: code,
      title,
      levels,
      total: levels.reduce((s, x) => s + x, 0),
    }
  })

  const levelTotals = [0, 1, 2, 3, 4].map(i =>
    paths.reduce((s, p) => s + p.levels[i]!, 0)
  ) as [number, number, number, number, number]

  const levels: EducationLevelRow[] = [
    ...levelTotals.map((count, i) => ({
      key: `L${i + 1}`,
      count,
      byPath: paths
        .filter(p => p.levels[i]! > 0)
        .map(p => ({ path: p.path, count: p.levels[i]! }))
        .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path)),
    })),
    { key: 'DTM', count: totals.dtm, byPath: [] },
  ]

  const hasAnyBase = [...divisions.values()].some(u => u.hasBase)
  const baseMembers = hasAnyBase
    ? [...divisions.values()].reduce((s, u) => s + u.base, 0)
    : null

  const toRow = (u: Unit): EducationRollupRow => {
    const base = u.hasBase ? u.base : null
    return {
      key: u.key,
      id: u.id,
      divisionId: u.divisionId,
      awards: u.totals.awards,
      pathways: u.totals.pathways,
      legacy: u.totals.legacy,
      dtm: u.totals.dtm,
      clubsWithAward: u.clubs.size,
      membersWithAward: membersSection ? u.members : null,
      baseMembers: base,
      awardsPerBaseMember: base ? u.totals.awards / base : null,
    }
  }
  const byKey = (a: EducationRollupRow, b: EducationRollupRow) =>
    a.key.localeCompare(b.key, undefined, { numeric: true })

  const source = achievements.sources[0]
  return {
    status: 'available',
    totals,
    kpis: {
      awards: totals.awards,
      membersWithAward,
      dtms: totals.dtm,
      tripleCrownAchievers:
        reports.sections.tripleCrown?.summary.achieverCount ?? null,
      baseMembers,
      awardsPerBaseMember: baseMembers ? totals.awards / baseMembers : null,
    },
    levels,
    paths,
    levelTotals,
    legacyByCode: [...legacy]
      .map(([code, count]) => ({ code, count }))
      .sort(byCountThenCode),
    otherByCode: [...other]
      .map(([code, count]) => ({ code, count }))
      .sort(byCountThenCode),
    divisions: [...divisions.values()].map(toRow).sort(byKey),
    areas: [...areas.values()].map(toRow).sort(byKey),
    source: {
      reportType: source?.reportType ?? '',
      asOf: source?.asOf ?? '',
    },
  }
}
