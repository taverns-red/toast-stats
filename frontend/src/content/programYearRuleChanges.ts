/**
 * Program-year rule-change log (#1400).
 *
 * Toastmasters changes the recognition rules between program years, and this
 * codebase already encodes several of those changes — but until now nothing
 * told a *reader*. A district leader comparing 2025-26 to 2026-27 education
 * numbers had no way to know the goals were not like-for-like.
 *
 * Rendered by `/methodology` §10; each entry is deep-linkable as
 * `/methodology#<id>` so a chart, card or tooltip can point at the exact rule
 * that makes two years incomparable.
 */

/** One TI rule change, in the program year it took effect. */
export interface ProgramYearRuleChange {
  /**
   * Stable anchor id — the deep-link target (`/methodology#<id>`). Prefixed
   * with its own program year so a shared link is self-describing. Treat as
   * a public URL: never rename one, only add.
   */
  id: string
  /** The program year the change took effect, "YYYY-YYYY". */
  programYear: string
  /** One-line headline of what changed. */
  title: string
  /** The metric(s) a reader watches move because of this. */
  affects: string
  /** What Toastmasters changed — the rule, not the column name. */
  whatChanged: string
  /** Why it matters when comparing this year against the one before. */
  comparability: string
  /** Tracking issues that landed the change here. */
  issues: number[]
  /**
   * Repo-relative paths of the code that implements the change.
   *
   * Not decoration: the drift guard
   * (`frontend/src/__tests__/guards/programYearRuleChangeLog.test.ts`) reads
   * these to decide which files are *claimed* by the log, and fails when a
   * rule-bearing file or a program year appears in the code with no entry
   * here. See that file's header for the full drift-protection decision.
   */
  sources: string[]
}

/** Newest program year first; within a year, most reader-visible first. */
export const PROGRAM_YEAR_RULE_CHANGES: readonly ProgramYearRuleChange[] = [
  // ───────────────────────────── PY 2026-2027 ─────────────────────────────
  {
    id: 'py-2026-2027-district-boundaries-redrawn',
    programYear: '2026-2027',
    title:
      'District boundaries were redrawn — clubs changed districts on July 1',
    affects:
      'District club counts · membership and payments year-over-year · district rankings · “What Changed” roster events',
    whatChanged:
      'Toastmasters redrew the district map effective 1 July 2026, merging and splitting districts — 25 fewer than the year before, with several renumbered into a new 201–231 range. Clubs moved between districts without joining or leaving Toastmasters: a district that absorbed part of a neighbour keeps its number and its history but is a different set of clubs on either side of that date.',
    comparability:
      'A district’s 2026-27 figures are measured over a different set of clubs than its 2025-26 figures, so a year-over-year rise can be annexation rather than growth — Toast Stats suppresses those comparisons across the boundary rather than printing a number that is wrong. In “What Changed”, a diff that straddles 1 July 2026 says the boundaries moved and lists those clubs as moved in / moved out instead of joined / left, from 5 moved clubs upward: on a boundary where a reformation is a known fact, the boundary is the evidence a realignment happened and the size of the exchange only has to clear ordinary export churn. On any other program-year rollover that same wording needs a far larger exchange — at least 8 clubs and a fifth of the roster — because there the size is the only evidence there is.',
    issues: [1442, 1443, 1470],
    sources: [
      'packages/shared-contracts/src/reformation/districtReformation.ts',
      'packages/analytics-core/src/analytics/diffSnapshots.ts',
      'frontend/src/pages/DistrictChangesPage.tsx',
    ],
  },
  {
    id: 'py-2026-2027-district-club-growth-achievement',
    programYear: '2026-2027',
    title: 'New District Club Growth Achievement for early club chartering',
    affects: 'District recognition · new-club charter counts',
    whatChanged:
      'Toastmasters introduced the District Club Growth Achievement, recognising districts that reach club-charter milestones early: charter 3 or 5 new clubs by September 30, and 3, 5 or 10 new clubs by March 31. The count runs cumulatively from July 1, so the March total includes the clubs already counted in September, and a district holds the highest milestone it reached at each checkpoint.',
    comparability:
      'The achievement did not exist before 2026-27, so earlier program years show nothing for it — that blank is a rules artefact, not a district failing to earn it. Each checkpoint is judged on the charter count as it stood on that date, because a district’s count can fall later in the year without any charter being revoked: a club chartered this year that moves to another district takes its charter credit with it. One caveat about the underlying data: a new-club charter count of zero does not always mean no club was chartered. The count is derived from the raw district performance export, and a snapshot rebuilt without that export still carries the field, defaulted to zero — which is why every program-year-end file in the archive reads zero for every district. Toast Stats detects that pattern (a whole district set at zero, which does not otherwise happen) and reports the checkpoint as not collected rather than as a milestone missed.',
    issues: [1473, 1474, 1476, 1501],
    sources: [
      'frontend/src/utils/clubGrowthAchievement.ts',
      'frontend/src/components/ClubGrowthAchievementCard.tsx',
      // #1501: the "not collected" reading of a zeroed charter count — the
      // rule that keeps a rebuild artefact from being rendered as a verdict.
      'frontend/src/hooks/useClubGrowthMilestones.ts',
    ],
  },
  {
    id: 'py-2026-2027-dcp-goals-2-3-eom',
    programYear: '2026-2027',
    title: 'DCP goals 2 and 3 can be met by Online Meeting Mastery',
    affects:
      'Club DCP goals achieved · Level 2 award counts · club Distinguished tiers · district % Distinguished',
    whatChanged:
      'Toastmasters made an Online Meeting Mastery completion an alternative way to satisfy DCP goals 2 and 3, alongside a Level 2 award. TI publishes the two routes in one combined column ("Level 2s or EOM", "Add. Level 2s or EOM") and does not split them, so Toast Stats cannot tell them apart either.',
    comparability:
      'A club can now reach goals 2 and 3 by a route that did not exist in 2025-26, so education counts and goal-completion rates are not like-for-like across the boundary. Part of any year-over-year rise in Level 2 awards may be Online Meeting Mastery completions instead — and a club that finished Distinguished this year might not have on last year’s rules.',
    issues: [1399, 1402],
    sources: [
      'packages/analytics-core/src/analytics/dcpGoalDefinitions.ts',
      'packages/analytics-core/src/transformation/DataTransformer.ts',
      'frontend/src/utils/extractEducationLevels.ts',
      'frontend/src/components/EducationLevelsCard.tsx',
      'frontend/src/components/DCPGoalAnalysis.tsx',
    ],
  },
  {
    id: 'py-2026-2027-region-advisor-prerequisite-retired',
    programYear: '2026-2027',
    title:
      'Region Advisor Visit retired as a Distinguished District prerequisite',
    affects:
      'Distinguished District tier · district prerequisite checklist · Leadership Excellence streaks',
    whatChanged:
      'TI dropped the “2+ Region Advisor meetings” gate and stopped publishing its column. Four prerequisites remain for every district tier: District Success Plan, 85% director training, Market Analysis Plan, and Communication Plan. The tier thresholds themselves are unchanged from 2025-26.',
    comparability:
      'A district blocked from every tier by that single gate in 2025-26 is not blocked in 2026-27, so a tier can move without district performance changing. A prerequisite checklist shows four rows this year where last year showed five — the missing row means “no longer required”, not “not done”.',
    issues: [1344, 1354],
    sources: [
      'packages/analytics-core/src/rankings/DistinguishedDistrictCalculator.ts',
      'frontend/src/components/DistinguishedDistrictTrophyCase.tsx',
    ],
  },

  // ───────────────────────────── PY 2025-2026 ─────────────────────────────
  {
    id: 'py-2025-2026-district-tier-thresholds-raised',
    programYear: '2025-2026',
    title: 'Distinguished District thresholds raised at every tier',
    affects: 'Distinguished District tier · district trophy case',
    whatChanged:
      'Item 1490 Rev. 04/2025 raised every tier’s % Distinguished requirement by five points (40/45/50/55 → 45/50/55/60) and put club growth back in step with payments growth at 1/3/5/8%. Under the previous rules the two lowest tiers asked only for no net club loss, then one net club.',
    comparability:
      'The same district numbers earn a lower tier in 2025-26 than they did in 2024-25, so a district whose tier fell at this boundary may not have declined at all. Toast Stats scores each program year against that year’s own rules and never restates history — which is why a past year can show a tier today’s numbers would not earn.',
    issues: [329, 1116],
    sources: [
      'packages/analytics-core/src/rankings/DistinguishedDistrictCalculator.ts',
      'packages/collector-cli/src/services/TransformService.ts',
    ],
  },
  {
    id: 'py-2025-2026-district-prerequisites-expanded',
    programYear: '2025-2026',
    title: 'Three new hard gates on Distinguished District recognition',
    affects: 'Distinguished District tier · district prerequisite checklist',
    whatChanged:
      'Market Analysis Plan, Communication Plan and 2+ Region Advisor meetings joined District Success Plan and 85% director training as prerequisites — two gates became five — and TI added the matching Y/N columns to the All Districts Summary export.',
    comparability:
      'Before 2025-26 only the District Success Plan and director training could block a tier, so a pre-2025-26 district that would have failed the newer gates was still recognised. Where a year’s rules required a prerequisite its data does not carry, Toast Stats reports the tier as Unknown rather than guessing — and an Unknown year also breaks a Leadership Excellence streak.',
    issues: [329, 1116],
    sources: [
      'packages/analytics-core/src/rankings/DistinguishedDistrictCalculator.ts',
      'packages/analytics-core/src/rankings/BordaCountRankingCalculator.ts',
      'packages/analytics-core/src/rankings/LeadershipExcellenceCalculator.ts',
      'packages/collector-cli/src/types/collector.ts',
    ],
  },
  {
    id: 'py-2025-2026-club-success-plan-required',
    programYear: '2025-2026',
    title: 'Club Success Plan submission required for Distinguished clubs',
    affects:
      'Club Distinguished tiers · district, area and division Distinguished club counts · Toast Stats club health (Thriving)',
    whatChanged:
      'From 2025-26 a club must have submitted a Club Success Plan to earn any Distinguished level, however many DCP goals it met, and TI began publishing the CSP column. Toast Stats also makes CSP submission one of the three conditions for its own Thriving club-health label.',
    comparability:
      'Program years before 2025-26 have no CSP column at all, so Toast Stats treats those clubs as having submitted rather than retroactively failing them. Distinguished-club counts and Thriving counts either side of this boundary are measured against different bars: a drop in 2025-26 can be paperwork rather than performance.',
    issues: [288, 311, 1121, 1139, 1460],
    sources: [
      'packages/analytics-core/src/analytics/ClubEligibilityUtils.ts',
      // The "What Changed" CSP event (#1460) is conditioned on this same
      // boundary — the column's ABSENCE before 2025-26 is why a flip is
      // emitted only when both snapshots carry a real boolean.
      'packages/analytics-core/src/analytics/diffSnapshots.ts',
      'packages/shared-contracts/src/schemas/snapshot-diff.schema.ts',
      'packages/analytics-core/src/analytics/ClubHealthAnalyticsModule.ts',
      'packages/analytics-core/src/analytics/DistinguishedClubAnalyticsModule.ts',
      'packages/analytics-core/src/analytics/AreaDivisionRecognitionModule.ts',
      'packages/analytics-core/src/interfaces.ts',
      'packages/analytics-core/src/types/clubHealth.ts',
      'packages/analytics-core/src/transformation/DataTransformer.ts',
      'packages/shared-contracts/src/types/district-statistics-file.ts',
      'frontend/src/utils/dcpProjections.ts',
      'frontend/src/utils/provisionalDistinguished.ts',
      'frontend/src/utils/extractDivisionPerformance.ts',
    ],
  },
  {
    id: 'py-2025-2026-smedley-distinguished-club',
    programYear: '2025-2026',
    title: 'Smedley Distinguished added as a club recognition tier',
    affects: 'Club recognition tier · the mix of distinguished clubs',
    whatChanged:
      'A fifth club rung — all 10 DCP goals and 25+ paid members, with no growth alternative — was added above President’s Distinguished, and the district export gained a Smedley Distinguished Clubs count. At district level Smedley is not new: that tier has existed since 2018-19 (see below).',
    comparability:
      'No club could be Smedley before 2025-26, so the top rung appearing at this boundary is the new tier, not clubs suddenly performing better — those clubs were counted as President’s Distinguished before. Totals of “Distinguished or better” clubs are unaffected. Toast Stats resolves the club ladder per program year, so a pre-2025-26 club with 10 goals and 25 members is shown as President’s Distinguished — the tier it held at the time.',
    issues: [329, 1406, 1498, 1500],
    sources: [
      'packages/analytics-core/src/analytics/ClubEligibilityUtils.ts',
      'packages/analytics-core/src/rankings/BordaCountRankingCalculator.ts',
      'packages/analytics-core/src/rollup/globalTotals.ts',
      'packages/shared-contracts/src/types/all-districts-rankings.ts',
      'packages/shared-contracts/src/schemas/all-districts-rankings.schema.ts',
      'packages/collector-cli/src/types/collector.ts',
      'frontend/src/utils/globalHistoryView.ts',
    ],
  },

  // ───────────────────────────── PY 2022-2023 ─────────────────────────────
  {
    id: 'py-2022-2023-district-club-growth-decoupled',
    programYear: '2022-2023',
    title: 'District club growth decoupled from payment growth',
    affects: 'Distinguished District tier',
    whatChanged:
      'Item 1490 Rev. 12/2022 replaced the symmetric growth ladder with an asymmetric one: payments growth stayed at 1/3/5/8% while the club requirement became no net club loss, then +1 club, then 3%, then 5%. The % Distinguished ladder stayed at 40/45/50/55.',
    comparability:
      'Across the 2021-22 → 2022-23 boundary districts were measured on a materially easier club requirement at the two lower tiers and a harder one at the top, so counts of Distinguished districts either side are not like-for-like. This ruleset governs every year Toast Stats shows from 2022-23 to 2024-25.',
    issues: [1116],
    sources: [
      'packages/analytics-core/src/rankings/DistinguishedDistrictCalculator.ts',
    ],
  },

  // ───────────────────────────── PY 2018-2019 ─────────────────────────────
  {
    id: 'py-2018-2019-district-smedley-added',
    programYear: '2018-2019',
    title: 'Smedley Distinguished added at district level',
    affects: 'Distinguished District tier',
    whatChanged:
      'The Board added a fourth district tier — 8% payments growth, 8% club growth, 55% Distinguished — and set the ladder at 1.5/3/5/8% growth with 40/45/50/55% Distinguished. The change applied to the whole 2018-19 program year.',
    comparability:
      'No district can be Smedley before 2018-19, so the tier’s absence in earlier years is a rules artefact, not a performance story. These are the rules behind the earliest program years Toast Stats stores (2019-20 onward), and they held until the 2022-23 change above.',
    issues: [1116],
    sources: [
      'packages/analytics-core/src/rankings/DistinguishedDistrictCalculator.ts',
    ],
  },
]

/** One program year with its changes, newest year first. */
export interface ProgramYearRuleChangeGroup {
  programYear: string
  changes: ProgramYearRuleChange[]
}

/**
 * Group the log by program year, preserving the declared order (which is
 * already newest-first — the data module is the single ordering authority so
 * the page cannot re-sort it into disagreement with the guard).
 */
export const ruleChangesByProgramYear = (): ProgramYearRuleChangeGroup[] => {
  const groups: ProgramYearRuleChangeGroup[] = []
  for (const change of PROGRAM_YEAR_RULE_CHANGES) {
    const last = groups[groups.length - 1]
    if (last && last.programYear === change.programYear) {
      last.changes.push(change)
    } else {
      groups.push({ programYear: change.programYear, changes: [change] })
    }
  }
  return groups
}

/**
 * Every entry anchor id — the Methodology page whitelists these so a
 * hand-edited `#bogus` fragment can never drive an expand/scroll
 * (same chokepoint rule as the section ids, Lesson 144).
 */
export const ruleChangeAnchorIds = (): ReadonlySet<string> =>
  new Set(PROGRAM_YEAR_RULE_CHANGES.map(c => c.id))
