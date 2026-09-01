/**
 * Zod contract for `v1/global-history.json` — one worldwide row per COMPLETED
 * program year (#1499, epic #1496, ruled on #1426).
 *
 * `snapshots/{date}/global-totals.json` (#1498) answers "what did the world
 * look like on this date". This artifact answers "how did each program year
 * finish", so the /history extension (epic Sprint 4) renders the whole
 * five-year worldwide scoreboard from ONE fetch instead of ten.
 *
 * The operator ruling of 2026-08-31 governs every field: **publish ours,
 * state our basis**. A CEO-report match is a validation signal, never a
 * target. The doc comments below ARE the specification — a consumer that
 * renders a number without its stated basis is misreporting it.
 *
 * Five places where "absent" and "zero" are deliberately different facts:
 *
 * - `distinguishedClubs.smedley` is **null before program year 2025-2026**.
 *   The tier did not exist. Archived rankings nonetheless store a literal `0`
 *   back to 2022; echoing it would assert that no club reached a rung that
 *   was not on the ladder (#1406).
 * - `education` is **null when the year's `district_*_reports.json` set is
 *   absent** — never zero-filled. A zero education year is indistinguishable
 *   from a year we never fetched.
 * - `education.other` is a **published residual**, never dropped. Award codes
 *   that carry no `Level N` and are not `DTM…` (live: Pathways Mentor
 *   Program) land there so the buckets always sum to a stated whole.
 * - `clubMovement.newClubs` (report basis) is **null for every historical
 *   year**: the backfilled report files carry only `educationAchievements`.
 *   It is a DIFFERENT metric from `newClubsStillActive` and must never be
 *   relabelled as it (#1426 ruling 5, 2026-08-19).
 * - `membership.totalMembershipMarch31` is **null when the year's March-31
 *   snapshot has no rollup**.
 *
 * And one place where a zero is real but unreadable: the year-end tier block
 * is the ONLY date a tier block may be read from. Every March-31 rankings
 * file on record (2022→2026) carries zeros across all four distinguished
 * fields because Toastmasters does not confirm club recognition until the
 * year-end reconciliation. That is "not yet determined", not "none
 * qualified" — which is why the March-31 rollup contributes exactly one
 * field here, `totalMembershipMarch31`, and nothing else.
 *
 * @module global-history.schema
 */

import { z } from 'zod'
import { GlobalTotalsDistrictTiersSchema } from './global-totals.schema.js'

/** Format envelope, versioned like the other published artifacts. */
export const GlobalHistoryFormatSchema = z.object({
  version: z.string(),
  type: z.literal('global-history'),
})

/**
 * The district scope the year-end row was rolled up over — always the ids the
 * year-end date's own `all-districts-rankings.json` listed (#1465/#1466).
 */
export const GlobalHistoryDistrictsSchema = z.object({
  /** Ranking rows counted, INCLUDING the undistricted `U` bucket. */
  total: z.number().int(),
  /**
   * Every counted row except `U` — TI's own "N districts" basis. Lettered
   * districts (e.g. `F`) are districts and are counted here (#1426 ruling 4).
   */
  numbered: z.number().int(),
  /** Whether the year-end date's rankings carried a `U` row at all. */
  includesUndistricted: z.boolean(),
})

export const GlobalHistoryMembershipSchema = z.object({
  /**
   * PRIMARY membership basis: the June-30 sum of `clubPerformance` "Active
   * Members" over every club in the year-end date's in-scope district files,
   * each club counted once.
   */
  totalMembership: z.number().int(),
  /**
   * The same sum taken at the program year's March 31. TI's published "total
   * membership" row is Mar-31-based; we publish June-30 as primary and carry
   * this alongside, both stated, so neither number is silently substituted
   * for the other. `null` when the March-31 rollup is absent.
   */
  totalMembershipMarch31: z.number().int().nullable(),
  /** June-30 sum of `districtPerformance` "Total to Date", club-deduped. */
  totalPayments: z.number().int(),
  /** June-30 sum of the rankings rows' `paidClubs`. */
  paidClubs: z.number().int(),
  /** June-30 sum of the rankings rows' `activeClubs`. */
  activeClubs: z.number().int(),
  /** Distinct canonical club ids the June-30 sums ran over. */
  clubsCounted: z.number().int(),
  /**
   * `totalMembership ÷ paidClubs`, both June-30 — the basis ruled on #1426
   * (2026-08-19). `null` when `paidClubs` is 0.
   */
  avgClubSize: z.number().nullable(),
})

export const GlobalHistoryDistinguishedClubsSchema = z.object({
  /**
   * Sum of the year-end rankings rows' `distinguishedClubs`, which on THAT
   * surface is distinguished-**or better** (#1124, epic finding F4). The
   * similarly named `totals.*` fields inside `district_{id}.json` are
   * disjoint per-tier counts — the two surfaces must never be mixed.
   */
  distinguishedOrBetter: z.number().int(),
  /** Sum of `selectDistinguished` — a subset of the above. */
  select: z.number().int(),
  /** Sum of `presidentsDistinguished` — a subset. */
  presidents: z.number().int(),
  /**
   * Sum of `smedleyDistinguished` — a subset — or **null before PY 2025-2026**,
   * when the tier did not exist. Never 0 for those years (#1406).
   */
  smedley: z.number().int().nullable(),
  /**
   * Derived base rung: `distinguishedOrBetter − select − presidents − smedley`
   * (Smedley contributing 0 in the years it did not exist).
   */
  base: z.number().int().nonnegative(),
  /** `distinguishedOrBetter ÷ paidClubs × 100`; null when paidClubs is 0. */
  percentOfPaidClubs: z.number().nullable(),
})

export const GlobalHistoryDistinguishedDistrictsSchema = z.object({
  /**
   * Districts at Distinguished or better at the year-end date, scored under
   * the ruleset of the program year the SNAPSHOT DATE belongs to.
   */
  distinguishedOrBetter: z.number().int(),
  /**
   * Every district's verdict, tallied by tier. The tiers sum to
   * `districts.numbered`, NOT `districts.total`: `U` is clubs belonging to no
   * district and cannot earn District recognition, so it is not scored — but
   * it IS counted in every membership figure (#1426 ruling 4). `Unknown` is a
   * bucket of its own and is never counted as failing (#1116 item 5).
   */
  byTier: GlobalTotalsDistrictTiersSchema,
})

export const GlobalHistoryClubMovementSchema = z.object({
  /**
   * Clubs whose `Charter Date/Suspend Date` carries a charter date inside the
   * program year AND which still had a row at the year-end date. **Never
   * labelled plain "new clubs"** (#1426 ruling 5): it undercounts charters
   * that lapsed before the close, and it diverges most in bad years.
   */
  newClubsStillActive: z.number().int().nullable(),
  /**
   * Clubs whose `Charter Date/Suspend Date` carries a `Susp` date inside the
   * program year (#1497), carried whole from the year-end `global-totals`.
   *
   * `null` for a year whose stored `districtPerformance` rows carry no `Susp`
   * value at all — eight of the ten published years (#1514). That is a
   * collection gap in TI's archived dashboard, not a year without
   * suspensions, and the two must not share a rendering: `null` is "not on
   * file", `0` is a measured zero on a date whose column IS populated.
   */
  suspendedClubs: z.number().int().nullable(),
  /**
   * REPORT-BASIS new clubs: the record count of the year-end date's
   * `district_*_reports.json` `sections.newClubs`, scoped to the date's
   * rankings district set. This is TI's own "new clubs" basis and is a
   * DIFFERENT metric from `newClubsStillActive` — the page must label the two
   * differently and never substitute one for the other.
   *
   * `null` for every historical year: the backfilled report files carry only
   * `educationAchievements`. The series populates forward from the PY 2026-27
   * year-end (#1428 wiring, epic finding F4).
   */
  newClubs: z.number().int().nullable(),
})

/**
 * RAW education-achievement activity for the program year, summed from the
 * year-end date's `district_*_reports.json` `educationAchievements` records,
 * scoped to the date's rankings district set.
 *
 * NOT DCP credit (#1080). DCP education credit counts DISTINCT MEMBERS per
 * award tier and is sourced from `clubPerformance` "Level 1s"/… — member
 * dedup is unrecoverable here because the personal `Member` column is dropped
 * at parse time. Never conflate the two.
 */
export const GlobalHistoryEducationSchema = z.object({
  /** Award codes ending `Level 1` (e.g. `MS1Motivational Strategies Level 1`). */
  level1: z.number().int(),
  level2: z.number().int(),
  level3: z.number().int(),
  level4: z.number().int(),
  level5: z.number().int(),
  /** Codes starting `DTM` (live: `DTMDistinguished Toastmaster`). */
  dtm: z.number().int(),
  /**
   * Every other code — the published residual (live: `PWMENTORPGMPathways
   * Mentor Program`). Never dropped: a breakdown without its residual is a
   * breakdown of an unstated subset.
   */
  other: z.number().int(),
  /** `level1..level5 + dtm + other`. The stated whole. */
  total: z.number().int(),
  /** How many in-scope districts supplied an `educationAchievements` section. */
  districtsReporting: z.number().int(),
  /**
   * Report files present at the date for districts OUTSIDE the date's own
   * rankings set, and therefore excluded from the sums (#1465). Published
   * rather than swallowed: a non-empty list means the snapshot directory is
   * contaminated.
   */
  excludedDistricts: z.array(z.string()),
})

/** One completed program year. */
export const GlobalHistoryYearSchema = z.object({
  /** e.g. `2024-2025`. */
  programYear: z.string(),
  /** The latest snapshot date inside the program year (YYYY-MM-DD). */
  yearEndDate: z.string(),
  /** The program year's March 31 snapshot date, or null when it has none. */
  marchDate: z.string().nullable(),
  districts: GlobalHistoryDistrictsSchema,
  membership: GlobalHistoryMembershipSchema,
  distinguishedClubs: GlobalHistoryDistinguishedClubsSchema,
  distinguishedDistricts: GlobalHistoryDistinguishedDistrictsSchema,
  clubMovement: GlobalHistoryClubMovementSchema,
  /** Null when the year's reports set is absent — never zero-filled. */
  education: GlobalHistoryEducationSchema.nullable(),
})

/**
 * A completed program year that HAS a year-end snapshot but whose
 * `global-totals.json` was missing, so no row could be assembled. Published
 * (and logged loudly by the writer) rather than silently absent: a gap in the
 * series is a backfill gap, remediable by a `backfill-global-totals` dispatch,
 * and a reader must be able to tell it from "that year never happened".
 */
export const GlobalHistoryOmittedYearSchema = z.object({
  programYear: z.string(),
  yearEndDate: z.string(),
  reason: z.string(),
})

/** The published `v1/global-history.json` artifact. */
export const GlobalHistorySchema = z.object({
  _format: GlobalHistoryFormatSchema,
  /** ISO timestamp the artifact was assembled at. */
  generatedAt: z.string(),
  /** Completed program years, NEWEST FIRST. The in-progress year has no row. */
  years: z.array(GlobalHistoryYearSchema),
  /** Completed years that could not be assembled. Usually empty. */
  omitted: z.array(GlobalHistoryOmittedYearSchema),
})

export type GlobalHistoryFormat = z.infer<typeof GlobalHistoryFormatSchema>
export type GlobalHistoryDistricts = z.infer<
  typeof GlobalHistoryDistrictsSchema
>
export type GlobalHistoryMembership = z.infer<
  typeof GlobalHistoryMembershipSchema
>
export type GlobalHistoryDistinguishedClubs = z.infer<
  typeof GlobalHistoryDistinguishedClubsSchema
>
export type GlobalHistoryDistinguishedDistricts = z.infer<
  typeof GlobalHistoryDistinguishedDistrictsSchema
>
export type GlobalHistoryClubMovement = z.infer<
  typeof GlobalHistoryClubMovementSchema
>
export type GlobalHistoryEducation = z.infer<
  typeof GlobalHistoryEducationSchema
>
export type GlobalHistoryYear = z.infer<typeof GlobalHistoryYearSchema>
export type GlobalHistoryOmittedYear = z.infer<
  typeof GlobalHistoryOmittedYearSchema
>
export type GlobalHistory = z.infer<typeof GlobalHistorySchema>

/** The `_format` envelope every writer stamps on the artifact. */
export const GLOBAL_HISTORY_FORMAT: GlobalHistoryFormat = {
  version: '1.0.0',
  type: 'global-history',
}

/** The published object path, so writer and reader cannot drift apart. */
export const GLOBAL_HISTORY_OBJECT_PATH = 'v1/global-history.json'
