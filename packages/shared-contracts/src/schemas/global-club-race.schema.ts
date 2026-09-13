/**
 * Zod contract for `snapshots/{date}/global-club-race.json` — the worldwide
 * "race to Distinguished" for one snapshot date (#1556, spec
 * `docs/specs/global-club-rankings.md` §3.3).
 *
 * A projection of the crossing store (`club-race-store.schema`) onto one
 * date's district files. The frontend reads this ONE file for the whole
 * `/clubs` area; there is no all-clubs artifact and 94 district files a
 * page view is not an option (spec §2.2).
 *
 * Design commitments the shape enforces:
 *
 * - **No global list with a bottom.** `reached` holds only clubs that have
 *   crossed at least one line (or carry TI's official code). Everything
 *   about clubs that have not is a histogram (`distribution`), so a club's
 *   cohort percentile is computable client-side without a per-club row.
 * - **Every crossing carries its window.** `reachedOn` + `observedAfter`
 *   — a consumer must render "between A and B" when they are not adjacent.
 * - **Crossings are sticky; standing is current.** `tiers` is what the
 *   store recorded; `current` is today's numbers, `null` when the club is
 *   not in today's snapshot. A row never carries a "lost it" label.
 * - **The basis is stated, not implied.** `ruleset` names the program
 *   year's tiers, the CSP gate, the Smedley rung's availability and the
 *   membership basis in force at this date (ruling R-A: confirmed April
 *   renewals Jul–Mar, active members Apr–Jun).
 *
 * @module global-club-race.schema
 */

import { z } from 'zod'
import {
  ClubRaceOfficialCodeSchema,
  ClubRaceTierSchema,
} from './club-race-store.schema.js'

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Count = z.number().int().nonnegative()

/** Eleven buckets: goals met 0 … 10. */
const GoalsHistogram = z.array(Count).length(11)

export const GlobalClubRaceFormatSchema = z.object({
  version: z.string(),
  type: z.literal('global-club-race'),
})

export const GlobalClubRaceScopeSchema = z.object({
  /** Same district basis as global-totals (#1465): the date's OWN rankings set. */
  districts: z.object({
    total: Count,
    numbered: Count,
    includesUndistricted: z.boolean(),
  }),
  /** Clubs read from in-scope district files today. */
  clubsScanned: Count,
  /** District files present but not in the date's rankings set. */
  excludedDistricts: z.array(z.string()),
  /** Districts the date's set lists but no file supplied. */
  missingDistricts: z.array(z.string()),
  /** Reached rows whose club is not in today's snapshot (`current: null`). */
  reachedAbsentToday: Count,
  /** Rows present only because TI's official code was seen, with no derived crossing. */
  officialWithoutDerived: Count,
})

export const GlobalClubRaceTierRuleSchema = z.object({
  level: ClubRaceTierSchema,
  goals: Count,
  members: Count,
  /** Net-growth substitute for the member minimum; null where none exists. */
  netGrowthAlternative: z.number().int().nullable(),
})

export const GlobalClubRaceMembershipBasisSchema = z.enum([
  'confirmed-renewals',
  'active-members',
])

export const GlobalClubRaceRulesetSchema = z.object({
  programYear: z.string(),
  cspRequired: z.boolean(),
  smedleyAvailable: z.boolean(),
  /** The basis in force at THIS date's data month (ruling R-A). */
  membershipBasis: GlobalClubRaceMembershipBasisSchema,
  /** TI confers official recognition from April 1 of the program year. */
  officialRecognitionFrom: IsoDate,
  /** Highest rung first, as `clubTiersForProgramYear` orders them. */
  tiers: z.array(GlobalClubRaceTierRuleSchema),
})

export const GlobalClubRaceObservationSchema = z.object({
  firstObservedDate: IsoDate.nullable(),
  previousSnapshotDate: IsoDate.nullable(),
  /** Count of observed dates (the list lives in the store / dates.json). */
  observedDates: Count,
  /** From the median gap between observed dates. */
  resolution: z.enum(['daily', 'monthly', 'mixed', 'unknown']),
})

/** Cumulative clubs at or past each line, per observed date. */
export const GlobalClubRaceTimelinePointSchema = z.object({
  date: IsoDate,
  Distinguished: Count,
  Select: Count,
  President: Count,
  Smedley: Count,
  /** Clubs whose official TI code had been seen by this date. */
  official: Count,
})

export const GlobalClubRaceMembershipBandsSchema = z.object({
  lt12: Count,
  from12to19: Count,
  from20to24: Count,
  ge25: Count,
})

export const GlobalClubRaceDistributionSchema = z.object({
  /** Σ = clubsScanned. */
  goalsMet: GoalsHistogram,
  /** Active-member bands, Σ = clubsScanned. */
  membership: GlobalClubRaceMembershipBandsSchema,
  /** Highest tier whose requirements are met TODAY on the stated basis. */
  byTierRequirementsMet: z.object({
    none: Count,
    Distinguished: Count,
    Select: Count,
    President: Count,
    Smedley: Count,
  }),
  byOfficialCode: z.object({
    none: Count,
    D: Count,
    S: Count,
    P: Count,
    M: Count,
  }),
  /** Goals histogram per membership band — "clubs like yours". */
  cohorts: z.object({
    lt12: GoalsHistogram,
    from12to19: GoalsHistogram,
    from20to24: GoalsHistogram,
    ge25: GoalsHistogram,
  }),
})

export const GlobalClubRaceLevelSchema = z.enum([
  'NotDistinguished',
  'Distinguished',
  'Select',
  'President',
  'Smedley',
])

/** Today's numbers for a reached club — null on the row when absent today. */
export const GlobalClubRaceCurrentSchema = z.object({
  /** Highest tier met today on the ruleset's membership basis. */
  level: GlobalClubRaceLevelSchema,
  /**
   * The same ladder read on active members (what the per-district
   * `distinguishedLevel` publishes). Before April this can sit ABOVE `level`;
   * that gap is the "unconfirmed" affordance, never a different noun.
   */
  activeMembersLevel: GlobalClubRaceLevelSchema,
  goalsMet: Count,
  members: Count,
  membershipBase: Count,
  netGrowth: z.number().int(),
  aprilRenewals: Count,
  cspSubmitted: z.boolean(),
  /** Ten INDEPENDENT goals, copied verbatim; null when the file lacks them. */
  dcpGoalsAchieved: z.array(z.boolean()).length(10).nullable(),
  divisionId: z.string(),
  areaId: z.string(),
  country: z.string().nullable(),
})

export const GlobalClubRaceTierStandingSchema = z.object({
  reachedOn: IsoDate,
  observedAfter: IsoDate.nullable(),
  /** Competition rank by reachedOn within the tier — ties share a rank. */
  rank: z.number().int().min(1),
})

export const GlobalClubRaceReachedSchema = z.object({
  clubId: z.string(),
  clubName: z.string(),
  /** District at the latest sighting (a transfer never resets crossings). */
  districtId: z.string(),
  current: GlobalClubRaceCurrentSchema.nullable(),
  tiers: z
    .object({
      Distinguished: GlobalClubRaceTierStandingSchema.optional(),
      Select: GlobalClubRaceTierStandingSchema.optional(),
      President: GlobalClubRaceTierStandingSchema.optional(),
      Smedley: GlobalClubRaceTierStandingSchema.optional(),
    })
    .strict(),
  official: z
    .object({
      code: ClubRaceOfficialCodeSchema,
      since: IsoDate,
      observedAfter: IsoDate.nullable(),
    })
    .nullable(),
})

const PerTierCount = z.object({
  Distinguished: Count,
  Select: Count,
  President: Count,
  Smedley: Count,
})

export const GlobalClubRaceDistrictSchema = z.object({
  districtId: z.string(),
  region: z.string(),
  /** Clubs read from this district's file today. */
  clubs: Count,
  /** The recognition denominator (Lesson 60). */
  paidClubBase: Count,
  reached: PerTierCount,
  /** reached.Distinguished ÷ paidClubBase × 100; null for `U` or a zero base. */
  percentOfBase: z.number().min(0).max(100).nullable(),
  firstReachedOn: z.object({
    Distinguished: IsoDate.nullable(),
    Select: IsoDate.nullable(),
    President: IsoDate.nullable(),
    Smedley: IsoDate.nullable(),
  }),
  /** (club, tier) entries at rank 1 worldwide that this district owns. */
  worldwideFirsts: Count,
})

/** The published `snapshots/{date}/global-club-race.json` artifact. */
export const GlobalClubRaceSchema = z.object({
  _format: GlobalClubRaceFormatSchema,
  date: IsoDate,
  programYear: z.string(),
  generatedAt: z.string(),
  scope: GlobalClubRaceScopeSchema,
  ruleset: GlobalClubRaceRulesetSchema,
  observation: GlobalClubRaceObservationSchema,
  timeline: z.array(GlobalClubRaceTimelinePointSchema),
  distribution: GlobalClubRaceDistributionSchema,
  reached: z.array(GlobalClubRaceReachedSchema),
  byDistrict: z.array(GlobalClubRaceDistrictSchema),
})

export type GlobalClubRaceFormat = z.infer<typeof GlobalClubRaceFormatSchema>
export type GlobalClubRaceScope = z.infer<typeof GlobalClubRaceScopeSchema>
export type GlobalClubRaceTierRule = z.infer<
  typeof GlobalClubRaceTierRuleSchema
>
export type GlobalClubRaceMembershipBasis = z.infer<
  typeof GlobalClubRaceMembershipBasisSchema
>
export type GlobalClubRaceRuleset = z.infer<typeof GlobalClubRaceRulesetSchema>
export type GlobalClubRaceObservation = z.infer<
  typeof GlobalClubRaceObservationSchema
>
export type GlobalClubRaceTimelinePoint = z.infer<
  typeof GlobalClubRaceTimelinePointSchema
>
export type GlobalClubRaceMembershipBands = z.infer<
  typeof GlobalClubRaceMembershipBandsSchema
>
export type GlobalClubRaceDistribution = z.infer<
  typeof GlobalClubRaceDistributionSchema
>
export type GlobalClubRaceLevel = z.infer<typeof GlobalClubRaceLevelSchema>
export type GlobalClubRaceCurrent = z.infer<typeof GlobalClubRaceCurrentSchema>
export type GlobalClubRaceTierStanding = z.infer<
  typeof GlobalClubRaceTierStandingSchema
>
export type GlobalClubRaceReached = z.infer<typeof GlobalClubRaceReachedSchema>
export type GlobalClubRaceDistrict = z.infer<
  typeof GlobalClubRaceDistrictSchema
>
export type GlobalClubRace = z.infer<typeof GlobalClubRaceSchema>

/** The `_format` envelope every writer stamps on the artifact. */
export const GLOBAL_CLUB_RACE_FORMAT: GlobalClubRaceFormat = {
  version: '1.0.0',
  type: 'global-club-race',
}

/** The published file name, so writer and reader cannot drift apart. */
export const GLOBAL_CLUB_RACE_FILE_NAME = 'global-club-race.json'
