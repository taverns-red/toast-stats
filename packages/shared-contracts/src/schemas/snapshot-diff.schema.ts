/**
 * Zod schema + inferred types for the snapshot-to-snapshot diff
 * ("What Changed", epic #797).
 *
 * The diff is computed by the pure `diffSnapshots(from, to)` engine in
 * analytics-core from two dated `DistrictStatisticsFile` snapshots and consumed
 * by the frontend `useSnapshotDiff` hook / `DistrictChangesPage`.
 *
 * Types are inferred from the schema (single source of truth) — same convention
 * as snapshot-pointer.schema.ts.
 *
 * @module snapshot-diff.schema
 * @see docs/design/what-changed-feature.md §4
 */

import { z } from 'zod'

/** A signed before/after pair. `delta === to - from`. */
export const AggregateDeltaSchema = z.object({
  from: z.number(),
  to: z.number(),
  delta: z.number(),
})
export type AggregateDelta = z.infer<typeof AggregateDeltaSchema>

/**
 * Category of a single change event.
 *
 * `payments` (#1459) carries a club's total payments delta with the payment
 * TYPE attribution folded into `label` text — October/April renewals and new
 * members from the typed club fields, late renewals and charter payments from
 * the raw `districtPerformance` rows, and an `N other` residual for whatever
 * the available types do not explain. The breakdown is deliberately NOT a
 * structured field: no consumer needs to compute over it yet, and the label is
 * what the feed, the export, and a screen reader all render. It supersedes the
 * Phase-1 decision to keep payments aggregate-only — per-club payments is the
 * renewal-season signal a district leader actually campaigns on, and the
 * magnitude sort keeps the ±1 churn below the material rows.
 *
 * `area-status` / `division-status` (#1014) carry recognition-tier transitions
 * for areas/divisions instead of clubs — derived in the frontend from the
 * verified recognition source-of-truth (`extractDivisionPerformance`), NOT the
 * analytics-core engine (which deliberately dropped tier logic in #799 to avoid
 * divergence — Lesson 117). Such events set `areaId`/`divisionId` rather than a
 * `clubId`.
 *
 * `club-status` (#1247) carries club OPERATIONAL-status transitions
 * (`Active`/`Low`/`Suspended`/`Ineligible`) — distinct from `distinguished`, a
 * recognition tier. Like the area/division transitions it is derived in the
 * frontend (`diffClubStatus`), comparing the `clubStatus` already present on
 * both snapshots; it is club-scoped (sets `clubId`/`clubName`).
 *
 * `club-transferred-in` / `club-transferred-out` (#1443) carry roster moves
 * caused by a DISTRICT-COMPOSITION change rather than by club behaviour — a
 * district realignment moved the boundary, not the club. They are emitted by
 * `diffSnapshots` in place of `club-added` / `club-removed` only when the diff
 * pair straddles a detected discontinuity (`SnapshotDiff.rosterDiscontinuity`);
 * genuine charters and closures keep the roster categories so they stay
 * visible instead of being buried among the transfers.
 */
export const DiffEventCategorySchema = z.enum([
  'membership',
  'payments',
  'dcp-goals',
  'distinguished',
  'club-added',
  'club-removed',
  'club-transferred-in',
  'club-transferred-out',
  'club-status',
  'area-status',
  'division-status',
])
export type DiffEventCategory = z.infer<typeof DiffEventCategorySchema>

/** Per-club delta for a club present in BOTH snapshots. */
export const ClubDiffSchema = z.object({
  clubId: z.string(),
  clubName: z.string(),
  divisionId: z.string(),
  areaId: z.string(),
  membership: AggregateDeltaSchema,
  payments: AggregateDeltaSchema,
  dcpGoals: AggregateDeltaSchema,
  /**
   * Raw `clubPerformance` "Club Distinguished Status" code
   * (`'' | D | S | P | M`). Authoritative per-club tier — `totals.*` distinguished
   * counts are unpopulated mid-year (Lesson 115). Never inferred from goal order.
   */
  distinguishedFrom: z.string(),
  distinguishedTo: z.string(),
  distinguishedChanged: z.boolean(),
})
export type ClubDiff = z.infer<typeof ClubDiffSchema>

/**
 * A club present in only one snapshot (joined or left the roster). Carries
 * `clubStatus` so appear/disappear is classified, not flagged as an error
 * (Lesson 118).
 */
export const ClubPresenceSchema = z.object({
  clubId: z.string(),
  clubName: z.string(),
  divisionId: z.string(),
  areaId: z.string(),
  clubStatus: z.string().optional(),
  /**
   * The club is in only one snapshot because the DISTRICT's composition
   * changed under it (#1443), not because it chartered or closed. Set only
   * when `SnapshotDiff.rosterDiscontinuity` is present, and absent otherwise —
   * a normal within-year presence entry is unchanged.
   */
  transferred: z.boolean().optional(),
})
export type ClubPresence = z.infer<typeof ClubPresenceSchema>

/**
 * A narrative-ready, categorized change event. `magnitude` is signed (sort key).
 *
 * `clubId`/`clubName` identify a club-scoped event (the Phase-1 default; both
 * empty for an entity-less aggregate line). `areaId`/`divisionId`/`entityName`
 * (#1014) identify an area- or division-scoped recognition transition — the
 * frontend links the entity to its scoped route from these. `label` always
 * BEGINS with the entity display name (club name or `entityName`) so the feed
 * can link just that leading token, matching the club-link contract (#1013).
 */
export const DiffEventSchema = z.object({
  category: DiffEventCategorySchema,
  clubId: z.string(),
  clubName: z.string(),
  /** Division ref — set for `division-status` and (with `areaId`) `area-status`. */
  divisionId: z.string().optional(),
  /** Area ref — set for `area-status` events. */
  areaId: z.string().optional(),
  /** Display name the label begins with for an area/division event (e.g. "Area B2"). */
  entityName: z.string().optional(),
  label: z.string(),
  magnitude: z.number(),
})
export type DiffEvent = z.infer<typeof DiffEventSchema>

/** Minimal per-side summary (extended in later phases). */
export const SnapshotDiffSideSchema = z.object({
  date: z.string(),
})
export type SnapshotDiffSide = z.infer<typeof SnapshotDiffSideSchema>

/** District-level aggregate deltas — the four KPI cards. */
export const SnapshotDiffTotalsSchema = z.object({
  membership: AggregateDeltaSchema,
  payments: AggregateDeltaSchema,
  clubCount: AggregateDeltaSchema,
  /** Count of clubs with any distinguished status, from `clubPerformance`. */
  distinguished: AggregateDeltaSchema,
})
export type SnapshotDiffTotals = z.infer<typeof SnapshotDiffTotalsSchema>

/**
 * A district-composition discontinuity between the two diffed dates (#1443).
 *
 * Toastmasters realigns district boundaries at a program-year boundary (the
 * 2026-07-01 reformation merged and split districts, moving clubs between
 * them). For a surviving district the default "previous → latest" pair
 * straddles that boundary, and the clubs that moved are NOT clubs that joined
 * or left — presenting them that way tells the reader something untrue.
 *
 * Present only when the diff engine detected the case; absent (and therefore
 * inert) for every ordinary diff.
 */
export const RosterDiscontinuitySchema = z.object({
  /** The only kind detected today: the pair straddles a July-1 boundary. */
  kind: z.literal('program-year-boundary'),
  /** Program year of `from.date`, e.g. "2025-2026". */
  fromProgramYear: z.string(),
  /** Program year of `to.date`, e.g. "2026-2027". */
  toProgramYear: z.string(),
  /** Clubs present only in `to` that were classified as transfers in. */
  clubsMovedIn: z.number(),
  /** Clubs present only in `from` that were classified as transfers out. */
  clubsMovedOut: z.number(),
})
export type RosterDiscontinuity = z.infer<typeof RosterDiscontinuitySchema>

/** The complete diff between two dated district snapshots. */
export const SnapshotDiffSchema = z.object({
  districtId: z.string(),
  from: SnapshotDiffSideSchema,
  to: SnapshotDiffSideSchema,
  /** Calendar days between from.date and to.date (honest about sparse gaps). */
  dayCount: z.number(),
  totals: SnapshotDiffTotalsSchema,
  clubs: z.object({
    bothPresent: z.array(ClubDiffSchema),
    onlyInFrom: z.array(ClubPresenceSchema),
    onlyInTo: z.array(ClubPresenceSchema),
  }),
  events: z.array(DiffEventSchema),
  /** Set when the two dates straddle a district-composition change (#1443). */
  rosterDiscontinuity: RosterDiscontinuitySchema.optional(),
})
export type SnapshotDiff = z.infer<typeof SnapshotDiffSchema>
