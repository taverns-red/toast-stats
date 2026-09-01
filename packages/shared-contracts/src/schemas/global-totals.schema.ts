/**
 * Zod contract for `snapshots/{date}/global-totals.json` — the worldwide
 * scoreboard for one snapshot date (#1498, epic #1496, ruled on #1426).
 *
 * Every other artifact this project publishes is per-district. This one is
 * the global rollup the TI CEO Report publishes as its "Numeric Snapshots".
 * The operator ruling of 2026-08-31 is **publish ours, state our basis**: a
 * CEO-report match is a validation signal, never a target, so every field
 * below carries the basis it was computed on in its doc comment. Those
 * comments are the specification — a consumer that renders a number without
 * its stated basis is misreporting it.
 *
 * Three shapes here exist because "absent" and "zero" are different facts:
 *
 * - `distinguishedClubs.smedley` is **null before program year 2025-2026**.
 *   The tier did not exist; archived rankings files nonetheless store a
 *   literal `0` back to 2022, and echoing that zero would assert that no
 *   club reached a rung that was not on the ladder.
 * - `clubsByCountry.unknown` is **published, never dropped**. Find-A-Club
 *   enrichment collapses on historical dates (45% unknown at 2026-06-30 vs
 *   ~2% at 2026-08-30, epic finding F2), so a country breakdown without its
 *   residual is a breakdown of an unstated subset.
 * - `distinguishedDistricts.undefinedVerdictDistricts` is its own bucket.
 *   A district whose prerequisite columns do not exist in its era's export
 *   scores `Unknown`, which is NOT the same as failing (#1116 item 5).
 *
 * @module global-totals.schema
 */

import { z } from 'zod'

/** Format envelope, versioned like the other published artifacts. */
export const GlobalTotalsFormatSchema = z.object({
  version: z.string(),
  type: z.literal('global-totals'),
})

/**
 * A club counted under more than one district *within the date's own
 * district set*. Published rather than swallowed: a non-empty list means the
 * snapshot directory is contaminated even after scoping (#1465/#1466).
 */
export const GlobalTotalsDuplicateClubSchema = z.object({
  /** Canonical club id (`normalizeClubId`). */
  clubId: z.string(),
  /** Every district the id was seen in, in read order. */
  districtIds: z.array(z.string()),
})

/**
 * The district scope this rollup was computed over — always the ids the
 * date's own `all-districts-rankings.json` lists, never a directory listing.
 */
export const GlobalTotalsDistrictsSchema = z.object({
  /** Ranking rows counted, INCLUDING the undistricted `U` bucket. */
  total: z.number().int(),
  /**
   * Every counted row except the undistricted `U` bucket — TI's own
   * "N districts" basis. Lettered districts (e.g. `F`) are districts and are
   * counted here; only `U` is excluded (#1426 ruling 4, 2026-08-19).
   */
  numbered: z.number().int(),
  /** Whether the date's rankings carried a `U` row at all. */
  includesUndistricted: z.boolean(),
  /** District files present in the directory but NOT in the date's set. */
  excludedDistricts: z.array(z.string()),
  /** Districts the date's set lists but no file supplied. */
  missingDistricts: z.array(z.string()),
  /** Clubs seen under two in-scope districts. Counted once; reported here. */
  duplicateClubs: z.array(GlobalTotalsDuplicateClubSchema),
})

export const GlobalTotalsMembershipSchema = z.object({
  /**
   * Sum of `clubPerformance` "Active Members" over ALL clubs listed in the
   * in-scope district files, each club counted once. NOT restricted to paid
   * or active clubs: at a year-end close, suspended clubs still carry rows
   * (15,016 rows vs 14,282 active clubs at 2026-06-30).
   */
  totalMembership: z.number().int(),
  /** Sum of `districtPerformance` "Total to Date", each club counted once. */
  totalPayments: z.number().int(),
  /** Sum of the rankings rows' `paidClubs`. */
  paidClubs: z.number().int(),
  /** Sum of the rankings rows' `activeClubs`. */
  activeClubs: z.number().int(),
  /** Distinct canonical club ids the membership/payment sums ran over. */
  clubsCounted: z.number().int(),
  /**
   * `totalMembership ÷ paidClubs` — the basis ruled on #1426 (2026-08-19).
   * On a June-30 date this is the year-end membership over year-end paid
   * clubs. `null` when `paidClubs` is 0 rather than a divide-by-zero.
   */
  avgClubSize: z.number().nullable(),
})

export const GlobalTotalsDistinguishedClubsSchema = z.object({
  /**
   * Sum of the rankings rows' `distinguishedClubs`, which on THAT surface is
   * distinguished-**or better** (#1124, epic finding F4). The similarly named
   * `totals.*` fields inside `district_{id}.json` are disjoint per-tier counts
   * — the two surfaces must never be mixed.
   */
  distinguishedOrBetter: z.number().int(),
  /** Sum of the rankings rows' `selectDistinguished` — a subset of the above. */
  select: z.number().int(),
  /** Sum of `presidentsDistinguished` — a subset of `distinguishedOrBetter`. */
  presidents: z.number().int(),
  /**
   * Sum of `smedleyDistinguished` — a subset — or **null before PY 2025-2026**,
   * when the tier did not exist. Never 0 for those years (#1406, d77c9dbd).
   */
  smedley: z.number().int().nullable(),
  /**
   * Derived base rung: `distinguishedOrBetter − select − presidents − smedley`
   * (Smedley contributing 0 in the years it did not exist).
   */
  base: z.number().int(),
  /** `distinguishedOrBetter ÷ paidClubs × 100`; null when paidClubs is 0. */
  percentOfPaidClubs: z.number().nullable(),
})

/** Tri-state tally: `Unknown` is a bucket of its own, never a failure. */
export const GlobalTotalsDistrictTiersSchema = z.object({
  Distinguished: z.number().int(),
  Select: z.number().int(),
  Presidents: z.number().int(),
  Smedley: z.number().int(),
  NotDistinguished: z.number().int(),
  Unknown: z.number().int(),
})

export const GlobalTotalsDistinguishedDistrictsSchema = z.object({
  /**
   * Districts at Distinguished or better, scored by
   * `DistinguishedDistrictCalculator` under the ruleset of the program year
   * the SNAPSHOT DATE belongs to — the program year is always passed, never
   * defaulted, or a historical year is scored under current rules.
   */
  distinguishedOrBetter: z.number().int(),
  /** Every district's verdict, tallied by tier. */
  byTier: GlobalTotalsDistrictTiersSchema,
  /**
   * Districts whose verdict is `Unknown` — the metrics earn a tier but a
   * prerequisite the era's rules require is unknowable from the data. These
   * are NOT counted as failing (#1116 item 5).
   */
  undefinedVerdictDistricts: z.array(z.string()),
})

export const GlobalTotalsClubMovementSchema = z.object({
  /**
   * Clubs whose `Charter Date/Suspend Date` carries a charter date inside the
   * snapshot date's program year AND which still have a row at the snapshot
   * date. **Never labelled plain "new clubs"** (#1426 ruling 5, 2026-08-19):
   * it undercounts charters that lapsed before the close, and it diverges
   * most in bad years. `null` when the movement window is unknown.
   */
  newClubsStillActive: z.number().int().nullable(),
  /**
   * Clubs whose `Charter Date/Suspend Date` carries a `Susp` date inside the
   * snapshot date's program year (#1497). `null` when the window is unknown.
   */
  suspendedClubs: z.number().int().nullable(),
})

export const GlobalTotalsCountrySchema = z.object({
  country: z.string(),
  clubs: z.number().int(),
})

export const GlobalTotalsClubsByCountrySchema = z.object({
  /** Descending by club count, ties broken by country name. */
  countries: z.array(GlobalTotalsCountrySchema),
  /**
   * Clubs Find-A-Club never matched to a country. Large on historical dates
   * (6,786 of 15,016 at 2026-06-30). Published so `countries` is always
   * readable as a share of a stated whole — `sum(countries) + unknown`
   * equals `membership.clubsCounted` (epic finding F2).
   */
  unknown: z.number().int(),
})

/** The published `snapshots/{date}/global-totals.json` artifact. */
export const GlobalTotalsSchema = z.object({
  _format: GlobalTotalsFormatSchema,
  /** The snapshot date this rollup describes (YYYY-MM-DD). */
  date: z.string(),
  /** The program year the snapshot date falls in, e.g. `2025-2026`. */
  programYear: z.string(),
  /** ISO timestamp the artifact was computed at. */
  generatedAt: z.string(),
  districts: GlobalTotalsDistrictsSchema,
  membership: GlobalTotalsMembershipSchema,
  distinguishedClubs: GlobalTotalsDistinguishedClubsSchema,
  distinguishedDistricts: GlobalTotalsDistinguishedDistrictsSchema,
  clubMovement: GlobalTotalsClubMovementSchema,
  clubsByCountry: GlobalTotalsClubsByCountrySchema,
})

export type GlobalTotalsFormat = z.infer<typeof GlobalTotalsFormatSchema>
export type GlobalTotalsDuplicateClub = z.infer<
  typeof GlobalTotalsDuplicateClubSchema
>
export type GlobalTotalsDistricts = z.infer<typeof GlobalTotalsDistrictsSchema>
export type GlobalTotalsMembership = z.infer<
  typeof GlobalTotalsMembershipSchema
>
export type GlobalTotalsDistinguishedClubs = z.infer<
  typeof GlobalTotalsDistinguishedClubsSchema
>
export type GlobalTotalsDistrictTiers = z.infer<
  typeof GlobalTotalsDistrictTiersSchema
>
export type GlobalTotalsDistinguishedDistricts = z.infer<
  typeof GlobalTotalsDistinguishedDistrictsSchema
>
export type GlobalTotalsClubMovement = z.infer<
  typeof GlobalTotalsClubMovementSchema
>
export type GlobalTotalsCountry = z.infer<typeof GlobalTotalsCountrySchema>
export type GlobalTotalsClubsByCountry = z.infer<
  typeof GlobalTotalsClubsByCountrySchema
>
export type GlobalTotals = z.infer<typeof GlobalTotalsSchema>

/** The `_format` envelope every writer stamps on the artifact. */
export const GLOBAL_TOTALS_FORMAT: GlobalTotalsFormat = {
  version: '1.0.0',
  type: 'global-totals',
}

/** The published file name, so writer and validator cannot drift apart. */
export const GLOBAL_TOTALS_FILE_NAME = 'global-totals.json'
