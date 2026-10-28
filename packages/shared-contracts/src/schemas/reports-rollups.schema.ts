/**
 * Zod contract for `snapshots/{date}/reports-rollups.json` — the
 * reports-derived region and world rollups (#2012, the remainder of #1799).
 *
 * `region-rollups.json` (#1799) is built by compute-analytics from the
 * date's district snapshots. The figures here exist only in the daily-reports
 * sidecars (`district_{id}_reports.json`), which `place-reports` lands after
 * that compute, so they are folded in their own artifact, written beside the
 * sidecars once they are placed:
 * - prospective clubs, by stage and by checklist steps complete (TI's
 *   Prospective Clubs report);
 * - coached clubs (Club Coaches; active = a PENDING assignment);
 * - October and April dues-renewal state (the renewal reports);
 * - officer lists submitted (the officer-list report);
 * - sponsors and mentors counts (#1795).
 * Each figure is read with the shared vocabulary (`reportsVocabulary.ts`), the
 * same reading as the district pages.
 *
 * Rules the shape encodes:
 * - **One merged set.** Every block is a grouping of the same set of sidecar
 *   records, scoped by the date's `all-districts-rankings.json` and
 *   deduplicated by club once, so `world` = Σ `districts` and a region = Σ its
 *   `districtIds`, by construction.
 * - **Each program year's own regions**, from
 *   `config/district-region-history.json` for the program year of the
 *   snapshot's LOGICAL date (the directory name).
 * - **Absent is not zero.** A figure is `null` when its report is missing for
 *   the district (no sidecar, or the section absent), and a block's figure is
 *   `null` when any of its districts' is. A present report with no rows is a
 *   measured 0.
 *
 * Counts only: no club names and no person data. Club ids appear only in
 * `scope.duplicateClubs`.
 *
 * @module reports-rollups.schema
 */

import { z } from 'zod'

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const ProgramYear = z.string().regex(/^\d{4}-\d{4}$/)
const Count = z.number().int().nonnegative()

/** 1.1.0 (#2388): optional `prospective.byStepsComplete`. 1.0.0 files lack
 *  it and still parse. */
export const REPORTS_ROLLUPS_VERSION = '1.1.0'

export const ReportsRollupsFormatSchema = z
  .object({
    version: z.string(),
    type: z.literal('reports-rollups'),
  })
  .strict()

/** Prospective clubs at one stage of TI's "#N <label>" ladder. */
export const ProspectiveStageCountSchema = z
  .object({
    /** The `#N`; null = text outside the recorded vocabulary. */
    stage: z.number().int().positive().nullable(),
    /** e.g. "Application to Organize"; "unrecognised" when `stage` is null. */
    label: z.string().min(1),
    clubs: Count,
  })
  .strict()

/**
 * Prospective clubs with N of TI's six checklist steps complete (#2388) —
 * the reading of `prospectProgress`, the district funnel's own.
 */
export const ProspectiveStepsCountSchema = z
  .object({
    /** Steps #1–#6 complete, in any order; null = text not recognised. */
    stepsComplete: z.number().int().min(0).max(6).nullable(),
    clubs: Count,
  })
  .strict()

/** Clubs on a dues-renewal report by state (`classifyDuesRenewal`). */
export const DuesRenewalCountsSchema = z
  .object({
    /** Clubs on the report. */
    clubs: Count,
    /** Verified inside this period's window. */
    verified: Count,
    /** Not here, or only last period's verification. */
    notReceived: Count,
    /** Minimum requirement not yet met. */
    low: Count,
    ineligible: Count,
    /** April only, before 1 January of the PY's second year. */
    notYetDue: Count,
    /** A status outside the recorded vocabulary. */
    other: Count,
  })
  .strict()

/** The figures every block carries (district, region, world). */
export const ReportsRollupFiguresSchema = z
  .object({
    prospective: z
      .object({
        clubs: Count,
        /** Clubs whose prospect text says "Payment Complete". */
        paymentComplete: Count,
        /**
         * Ascending by stage; the unrecognised group last. The #2142
         * furthest-step reading, kept for readers of 1.0.0; the funnel now
         * reads `byStepsComplete`.
         */
        byStage: z.array(ProspectiveStageCountSchema),
        /**
         * Most steps complete first; the unrecognised group last (#2388).
         * Absent in files written before 1.1.0.
         */
        byStepsComplete: z.array(ProspectiveStepsCountSchema).optional(),
      })
      .strict()
      .nullable(),
    coached: z
      .object({
        /** Distinct clubs with an active (PENDING) coach. */
        activeClubs: Count,
        /** Distinct clubs whose coaching is completed and none active. */
        completedClubs: Count,
      })
      .strict()
      .nullable(),
    octoberDues: DuesRenewalCountsSchema.nullable(),
    aprilDues: DuesRenewalCountsSchema.nullable(),
    officerList: z
      .object({ submitted: Count, notSubmitted: Count })
      .strict()
      .nullable(),
    sponsorsMentors: z
      .object({
        /** Distinct new clubs on the report. */
        clubs: Count,
        /** Σ assignments with a SPONSOR / SPONSORU code. */
        sponsors: Count,
        /** Σ assignments with a MENTOR / MENTORU code. */
        mentors: Count,
        /** Σ assignments with any other code. */
        other: Count,
        /** Σ assignments with status AWARDED. */
        awarded: Count,
      })
      .strict()
      .nullable(),
  })
  .strict()

/** Why a district's figures are null. */
export const ReportsRollupDistrictStatusSchema = z.enum([
  'available',
  /** No `district_{id}_reports.json` at the date. */
  'no-file',
  /** The sidecar is stamped with another program year. */
  'program-year-mismatch',
])

export const ReportsRollupDistrictSchema = ReportsRollupFiguresSchema.extend({
  /** The district's region this program year; null = not placed. */
  region: z.string().min(1).nullable(),
  reports: ReportsRollupDistrictStatusSchema,
}).strict()

export const ReportsRollupRegionSchema = ReportsRollupFiguresSchema.extend({
  /** The districts summed, ascending. */
  districtIds: z.array(z.string().min(1)).min(1),
  /** Of those, the ones whose sidecar is not available. */
  districtsWithoutReports: z.array(z.string()),
}).strict()

export const ReportsRollupWorldSchema = ReportsRollupFiguresSchema.extend({
  districts: Count,
  districtsWithoutReports: z.array(z.string()),
}).strict()

export const ReportsRollupsSchema = z
  .object({
    _format: ReportsRollupsFormatSchema,
    /** The snapshot's logical date (the directory name). */
    snapshotDate: IsoDate,
    /** The program year of `snapshotDate`. */
    programYear: ProgramYear,
    generatedAt: z.string(),
    /** Where the regions came from; null when they are not available. */
    regionMembership: z
      .object({
        source: z.literal('config/district-region-history.json'),
        asOf: IsoDate,
        programYear: ProgramYear,
      })
      .strict()
      .nullable(),
    /** Why `regions` is null; null when regions are available. */
    regionMembershipNote: z.string().nullable(),
    scope: z
      .object({
        /** Sidecars at the date whose district the rankings do not list. */
        excludedDistricts: z.array(z.string()),
        /** Districts with `region: null` while regions are available. */
        unassignedDistricts: z.array(z.string()),
        /** A club on two districts' reports: counted once, in the first. */
        duplicateClubs: z.array(
          z
            .object({
              clubId: z.string(),
              districtIds: z.array(z.string()).min(2),
            })
            .strict()
        ),
      })
      .strict(),
    world: ReportsRollupWorldSchema,
    /** Region id → its rollup; null = regions not available. */
    regions: z.record(z.string(), ReportsRollupRegionSchema).nullable(),
    /** Every in-scope district, keyed by its id. */
    districts: z.record(z.string(), ReportsRollupDistrictSchema),
  })
  .strict()

export type ReportsRollupsFormat = z.infer<typeof ReportsRollupsFormatSchema>
export type ProspectiveStageCount = z.infer<typeof ProspectiveStageCountSchema>
export type ProspectiveStepsCount = z.infer<typeof ProspectiveStepsCountSchema>
export type DuesRenewalCounts = z.infer<typeof DuesRenewalCountsSchema>
export type ReportsRollupFigures = z.infer<typeof ReportsRollupFiguresSchema>
export type ReportsRollupDistrictStatus = z.infer<
  typeof ReportsRollupDistrictStatusSchema
>
export type ReportsRollupDistrict = z.infer<typeof ReportsRollupDistrictSchema>
export type ReportsRollupRegion = z.infer<typeof ReportsRollupRegionSchema>
export type ReportsRollupWorld = z.infer<typeof ReportsRollupWorldSchema>
export type ReportsRollups = z.infer<typeof ReportsRollupsSchema>

/** The `_format` envelope every writer stamps on the artifact. */
export const REPORTS_ROLLUPS_FORMAT: ReportsRollupsFormat = {
  version: REPORTS_ROLLUPS_VERSION,
  type: 'reports-rollups',
}

/** The published file name, so writer and reader cannot drift apart. */
export const REPORTS_ROLLUPS_FILE_NAME = 'reports-rollups.json'
