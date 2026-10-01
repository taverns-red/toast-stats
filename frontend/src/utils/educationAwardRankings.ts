/**
 * Education award leaderboards (#1592).
 *
 * Two per-club ratios over the district's clubs, both normalised by the
 * club's membership base:
 * - awardsPerBase ("Crowning Glory"): counted education awards ÷ base, from
 *   the `educationAchievements` section (daily current-PY report or the
 *   prior-PY Archive backfill — same record shape).
 * - membersWithAward ("Team Spirit"): distinct members holding an award ÷
 *   base, from the `educationMembers` section (current PY only).
 *
 * Clubs with a base below MIN_ELIGIBLE_BASE are listed as ineligible, unranked.
 */
import type { DistrictReportsDataset } from '@taverns-red/shared-contracts'
import { computeTiedRanks } from './tieRankingUtils'

export const MIN_ELIGIBLE_BASE = 8

export interface EducationAwardClub {
  clubId: string
  clubName: string
  divisionId: string
  areaId: string
  membershipBase: number
}

export interface EducationAwardEntry extends EducationAwardClub {
  numerator: number
  denominator: number
  ratio: number
  rank: number | null
}

export interface EducationAwardRanking {
  available: boolean
  sourceReportType: string | null
  asOf: string
  ranked: EducationAwardEntry[]
  ineligible: EducationAwardEntry[]
}

/** Pathways level award (e.g. `PM1…`–`VC5…`) or DTM. */
const COUNTED_AWARD = /^(?:[A-Z]{2}[1-5]|DTM)/

export function isCountedEducationAward(award: string): boolean {
  return COUNTED_AWARD.test(award)
}

const unavailable = (): EducationAwardRanking => ({
  available: false,
  sourceReportType: null,
  asOf: '',
  ranked: [],
  ineligible: [],
})

type Section = {
  sources: { reportType: string; asOf: string }[]
}

function buildRanking(
  clubs: EducationAwardClub[],
  section: Section,
  numerators: Map<string, number>
): EducationAwardRanking {
  const entries: EducationAwardEntry[] = clubs.map(c => {
    const numerator = numerators.get(c.clubId) ?? 0
    const denominator = c.membershipBase
    return {
      ...c,
      numerator,
      denominator,
      ratio: denominator > 0 ? numerator / denominator : 0,
      rank: null,
    }
  })

  const eligible = entries
    .filter(e => e.denominator >= MIN_ELIGIBLE_BASE)
    .sort(
      (a, b) =>
        b.ratio - a.ratio ||
        a.clubName.localeCompare(b.clubName) ||
        a.clubId.localeCompare(b.clubId)
    )
  const ranks = computeTiedRanks(eligible, e => e.ratio)
  const ranked = eligible.map((e, i) => ({ ...e, rank: ranks[i]!.rank }))

  const source = section.sources[0]
  return {
    available: true,
    sourceReportType: source?.reportType ?? null,
    asOf: source?.asOf ?? '',
    ranked,
    ineligible: entries.filter(e => e.denominator < MIN_ELIGIBLE_BASE),
  }
}

export function computeEducationAwardRankings(
  clubs: EducationAwardClub[],
  reports: DistrictReportsDataset | null
): {
  awardsPerBase: EducationAwardRanking
  membersWithAward: EducationAwardRanking
} {
  const achievements = reports?.sections.educationAchievements
  const members = reports?.sections.educationMembers

  let awardsPerBase = unavailable()
  if (achievements) {
    const counts = new Map<string, number>()
    for (const r of achievements.records) {
      if (!isCountedEducationAward(r.award)) continue
      counts.set(r.club, (counts.get(r.club) ?? 0) + r.achievementCount)
    }
    awardsPerBase = buildRanking(clubs, achievements, counts)
  }

  let membersWithAward = unavailable()
  if (members) {
    const counts = new Map<string, number>()
    for (const r of members.records) {
      counts.set(r.club, (counts.get(r.club) ?? 0) + r.membersWithAward)
    }
    membersWithAward = buildRanking(clubs, members, counts)
  }

  return { awardsPerBase, membersWithAward }
}
