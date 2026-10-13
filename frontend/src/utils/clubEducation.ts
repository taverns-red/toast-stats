import {
  awardCodeFromAward,
  clubIdsMatch,
  pathwaysLevel,
  type DistrictReportsDataset,
} from '@taverns-red/shared-contracts'

/**
 * #1790 — the club page's Education panel, from the `educationAchievements`
 * ledger only (Ron, 2026-10-11, epic #1781 decision 6). No dashboard-CSV
 * "members credited" proxy anywhere: that counts DCP credits, not awards.
 *
 * Decision 10: every ledger award counts in the total, tagged by program —
 * Pathways (path level awards and the Pathways Mentor Program), Legacy (the
 * pre-Pathways communication/leadership track) — with DTM under its own
 * code. The vocabulary is the one actually seen in D61's sidecars
 * 2019-20 → 2026-27 (read 2026-10-11); TI renders each award as its code
 * immediately followed by its title.
 */
export type EducationProgram = 'Pathways' | 'Legacy' | 'DTM'

export interface ClassifiedEducationAward {
  program: EducationProgram
  code: string
  /** Pathways path title for a level award ("Presentation Mastery"). */
  pathName: string | null
  /** Pathways level 1–5; null for everything else. */
  level: number | null
}

export type ClubEducationSummary =
  | { available: false }
  | {
      available: true
      /** The ledger's own as-of text ("October 11, 2026"); '' for the archive. */
      asOf: string
      /** True when the ledger is TI's year-end Education Achievement Archive. */
      isArchive: boolean
      total: number
      byProgram: Record<EducationProgram, number>
      /** Pathways level awards, index 0 = Level 1 … index 4 = Level 5. */
      pathwaysLevels: number[]
      /** Pathways paths with level awards, most awards first. */
      paths: Array<{ code: string; name: string; count: number }>
      /** Distinct members with an award; null where the date has no count. */
      membersWithAward: number | null
    }

// The path title between the level code and its trailing "Level N".
const PATH_TITLE = /^(.*?)\s+Level\s+[1-5]\s*$/
// Longest codes first so ACB is not read as a two-letter code.
const LEGACY_CODES = [
  'LDREXC',
  'ATMB',
  'ATMS',
  'ATMG',
  'ACB',
  'ACS',
  'ACG',
  'ALB',
  'ALS',
  'ATM',
  'CTM',
  'CC',
  'CL',
] as const
const PATHWAYS_OTHER_CODES = ['PWMENTORPGM'] as const

/** Code prefix followed by the start of a title (a capital then lowercase). */
function startsWithCode(award: string, code: string): boolean {
  return award.startsWith(code) && /^[A-Z][a-z]/.test(award.slice(code.length))
}

export function classifyEducationAward(
  award: string
): ClassifiedEducationAward | null {
  const text = award.trim()
  if (!text) return null

  // The shared Pathways level vocabulary (#1976): a two- or three-capital
  // path code + level, so the vintage CES path is read like any other.
  const levelCode = awardCodeFromAward(text)
  const level = pathwaysLevel(levelCode)
  const title = level && PATH_TITLE.exec(text.slice(levelCode.length))
  if (level && title) {
    return {
      program: 'Pathways',
      code: level.path,
      pathName: title[1]!.trim() || null,
      level: level.level,
    }
  }
  if (startsWithCode(text, 'DTM')) {
    return { program: 'DTM', code: 'DTM', pathName: null, level: null }
  }
  for (const code of PATHWAYS_OTHER_CODES) {
    if (startsWithCode(text, code)) {
      return { program: 'Pathways', code, pathName: null, level: null }
    }
  }
  for (const code of LEGACY_CODES) {
    if (startsWithCode(text, code)) {
      return { program: 'Legacy', code, pathName: null, level: null }
    }
  }
  // Unknown code: still a ledger award, so it counts. TI's later programs
  // are all Pathways-era, so that is the honest default tag.
  const code = /^[A-Z]+?(?=[A-Z][a-z])/.exec(text)?.[0] ?? text
  return { program: 'Pathways', code, pathName: null, level: null }
}

/**
 * The club's slice of the ledger for the page's date (the sidecar was
 * fetched for that date by the analytics hook — R3). `available: false`
 * means the date has no ledger at all, which the panel must say in words:
 * it is not the same as a club with zero awards.
 */
export function summarizeClubEducation(
  reports: DistrictReportsDataset | null | undefined,
  clubId: string
): ClubEducationSummary {
  const ledger = reports?.sections.educationAchievements
  if (!ledger) return { available: false }

  const byProgram: Record<EducationProgram, number> = {
    Pathways: 0,
    Legacy: 0,
    DTM: 0,
  }
  const pathwaysLevels = [0, 0, 0, 0, 0]
  const paths = new Map<string, { code: string; name: string; count: number }>()
  let total = 0

  for (const record of ledger.records) {
    if (!clubIdsMatch(record.club, clubId)) continue
    const award = classifyEducationAward(record.award)
    if (!award) continue
    const n = record.achievementCount
    total += n
    byProgram[award.program] += n
    if (award.level !== null) {
      pathwaysLevels[award.level - 1]! += n
      const entry = paths.get(award.code) ?? {
        code: award.code,
        name: award.pathName ?? award.code,
        count: 0,
      }
      entry.count += n
      paths.set(award.code, entry)
    }
  }

  const membersSection = reports?.sections.educationMembers
  const membersWithAward = membersSection
    ? membersSection.records
        .filter(r => clubIdsMatch(r.club, clubId))
        .reduce((sum, r) => sum + r.membersWithAward, 0)
    : null

  const source = ledger.sources[0]
  return {
    available: true,
    asOf: source?.asOf ?? '',
    isArchive: source?.reportType === 'education-archive',
    total,
    byProgram,
    pathwaysLevels,
    paths: [...paths.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name)
    ),
    membersWithAward,
  }
}
