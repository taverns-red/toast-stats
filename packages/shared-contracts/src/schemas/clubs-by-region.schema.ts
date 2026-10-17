/**
 * Zod contracts for the per-region club shards (#1800, epic #1781):
 *
 * - `snapshots/{date}/clubs-by-region/<region>.json` — every club of one
 *   region, for the region explorer (#1808) and, fetched on demand, the
 *   world explorer (#1809);
 * - `snapshots/{date}/clubs-by-region/world.json` — per-region counts and
 *   the top-N seed rows (~10 KB gzip), so "All regions" renders its list
 *   without fetching any shard or the map points (#1809: <= 150 KB before
 *   the first 50 rows);
 * - `snapshots/{date}/clubs-by-region/world-points.json` — one map point
 *   per located club (~180 KB gzip at 15k clubs), loaded lazily by the
 *   clustered map.
 *
 * Rules the shape encodes:
 * - **Explorer fields only.** A row carries identity (id, name, district,
 *   region, division, area, city), the operational status, the shared
 *   health (#1120) and distinguished (#1406) classifications, a few health
 *   figures and coordinates. Never email, phone, links or meeting details:
 *   the row schema is strict, so an extra key fails the content gate.
 * - **Each program year's own regions.** A club's region is its district's
 *   region in `config/district-region-history.json` for the program year of
 *   the snapshot's LOGICAL date (the directory name), as region-rollups.json
 *   resolves it (#1799). A district the history does not place is in the
 *   `unassigned` shard; with no usable history there are no shards and
 *   `world.shards` is null, with the reason.
 * - **Unmapped is counted, not dropped.** A club without coordinates is a
 *   row with `lat`/`lng` null and is counted in `unmapped`; only map points
 *   need coordinates.
 * - **Short keys where the map reads them.** `d` (district), `h` (health:
 *   `t`/`v`/`i`), `t` (tier) and `tp` (tier provisional) are the keys the
 *   colour-mode spec (docs/design/map-pin-colour-modes.md) names.
 *
 * @module clubs-by-region.schema
 */

import { z } from 'zod'

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const ProgramYear = z.string().regex(/^\d{4}-\d{4}$/)
const Count = z.number().int().nonnegative()

export const CLUBS_BY_REGION_VERSION = '1.0.0'

/** The directory under `snapshots/{date}/` that holds every file here. */
export const CLUBS_BY_REGION_DIR = 'clubs-by-region'
/** The world file's name inside {@link CLUBS_BY_REGION_DIR}. */
export const CLUBS_BY_REGION_WORLD_FILE_NAME = 'world.json'
/** The map-points file's name inside {@link CLUBS_BY_REGION_DIR}. */
export const CLUBS_BY_REGION_WORLD_POINTS_FILE_NAME = 'world-points.json'
/** world.json's `pointsPath`, relative to `snapshots/{date}/`. */
export const CLUBS_BY_REGION_WORLD_POINTS_PATH =
  `${CLUBS_BY_REGION_DIR}/${CLUBS_BY_REGION_WORLD_POINTS_FILE_NAME}` as const
/** The shard key for districts the history does not place in a region. */
export const CLUBS_BY_REGION_UNASSIGNED = 'unassigned'
/** Length of each top-N seed list in the world file. */
export const CLUBS_BY_REGION_TOP_N = 50
/** The metrics the world file seeds a top-N list for. */
export const CLUBS_BY_REGION_TOP_METRICS = [
  'membership',
  'netGrowth',
  'dcpGoals',
] as const

/** A shard's file name inside {@link CLUBS_BY_REGION_DIR}. */
export function clubsByRegionShardFileName(region: string): string {
  return `${region}.json`
}

/** `t` thriving · `v` vulnerable · `i` intervention required (#1120). */
export const ClubsByRegionHealthSchema = z.enum(['t', 'v', 'i'])

/** The CSP-gated distinguished level; null = not distinguished. */
export const ClubsByRegionTierSchema = z
  .enum(['Smedley', 'President', 'Select', 'Distinguished'])
  .nullable()

/** One club as the explorers list and pin it. */
export const ClubsByRegionClubSchema = z
  .object({
    /** Canonical club number (leading zeros dropped). */
    id: z.string().min(1),
    name: z.string(),
    /** District id of the snapshot file the club came from. */
    d: z.string().min(1),
    /** The district's region for the snapshot's program year; null = unassigned. */
    region: z.string().nullable(),
    division: z.string(),
    area: z.string(),
    /** Find-A-Club `address.city`; null when not matched. */
    city: z.string().nullable(),
    /** TI operational status (`clubStatus`: Active, Low, Ineligible, Suspended). */
    status: z.string().nullable(),
    h: ClubsByRegionHealthSchema,
    t: ClubsByRegionTierSchema,
    /** The tier still rests on unconfirmed (pre-April) membership (#287). */
    tp: z.boolean(),
    /** Active members (`membershipCount`). */
    members: Count,
    /** Membership base; net growth = members − base. */
    base: Count,
    dcpGoals: Count,
    /** CSP submitted; null when the column was not collected. */
    csp: z.boolean().nullable(),
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
  })
  .strict()
  .refine(c => (c.lat === null) === (c.lng === null), {
    message: 'lat and lng are both set or both null',
  })

const RegionMembershipSchema = z
  .object({
    source: z.literal('config/district-region-history.json'),
    asOf: IsoDate,
    programYear: ProgramYear,
  })
  .strict()

const MapCountsSchema = z
  .object({ clubs: Count, mapped: Count, unmapped: Count })
  .strict()

export const ClubsByRegionShardFormatSchema = z
  .object({
    version: z.string(),
    type: z.literal('clubs-by-region-shard'),
  })
  .strict()

/** `snapshots/{date}/clubs-by-region/<region>.json`. */
export const ClubsByRegionShardSchema = z
  .object({
    _format: ClubsByRegionShardFormatSchema,
    snapshotDate: IsoDate,
    programYear: ProgramYear,
    generatedAt: z.string(),
    /** The region id ("01".."14"), or "unassigned". */
    region: z.string().regex(/^[A-Za-z0-9-]+$/),
    regionMembership: RegionMembershipSchema,
    /** The in-scope districts placed in this region. */
    districtIds: z.array(z.string()).min(1),
    counts: MapCountsSchema,
    /** Sorted by club id. */
    clubs: z.array(ClubsByRegionClubSchema),
  })
  .strict()

/** One located club on the world map: `[id, lat, lng, district, health]`. */
export const ClubsByRegionPointSchema = z.tuple([
  z.string().min(1),
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
  z.string().min(1),
  ClubsByRegionHealthSchema,
])

export const ClubsByRegionWorldFormatSchema = z
  .object({
    version: z.string(),
    type: z.literal('clubs-by-region-world'),
  })
  .strict()

const ShardEntrySchema = z
  .object({
    /** Path relative to `snapshots/{date}/`. */
    path: z.string(),
    districtIds: z.array(z.string()).min(1),
    clubs: Count,
    mapped: Count,
    unmapped: Count,
    health: z
      .object({
        thriving: Count,
        vulnerable: Count,
        interventionRequired: Count,
      })
      .strict(),
  })
  .strict()

const TopListSchema = z.array(ClubsByRegionClubSchema)

/** `snapshots/{date}/clubs-by-region/world.json`. */
export const ClubsByRegionWorldSchema = z
  .object({
    _format: ClubsByRegionWorldFormatSchema,
    snapshotDate: IsoDate,
    programYear: ProgramYear,
    generatedAt: z.string(),
    /** null when there was no usable history (see the note). */
    regionMembership: RegionMembershipSchema.nullable(),
    regionMembershipNote: z.string().nullable(),
    totals: z
      .object({
        districts: Count,
        clubs: Count,
        mapped: Count,
        unmapped: Count,
      })
      .strict(),
    /** Shard key → its file and counts; null = no shards for this date. */
    shards: z.record(z.string(), ShardEntrySchema).nullable(),
    /** Highest first, ties by club id; at most {@link CLUBS_BY_REGION_TOP_N}. */
    top: z
      .object({
        membership: TopListSchema,
        netGrowth: TopListSchema,
        dcpGoals: TopListSchema,
      })
      .strict(),
    /** The lazily loaded map points (`world-points.json`). */
    pointsPath: z.literal(CLUBS_BY_REGION_WORLD_POINTS_PATH),
    scope: z
      .object({
        /** District files on disk that the date's rankings do not list. */
        excludedDistricts: z.array(z.string()),
        /** A club in two district files: counted once, in the first. */
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
  })
  .strict()

export const ClubsByRegionWorldPointsFormatSchema = z
  .object({
    version: z.string(),
    type: z.literal('clubs-by-region-world-points'),
  })
  .strict()

/** `snapshots/{date}/clubs-by-region/world-points.json`. */
export const ClubsByRegionWorldPointsSchema = z
  .object({
    _format: ClubsByRegionWorldPointsFormatSchema,
    snapshotDate: IsoDate,
    programYear: ProgramYear,
    generatedAt: z.string(),
    /** = points.length = world.json `totals.mapped`. */
    count: Count,
    /** Every club with coordinates, sorted by club id. */
    points: z.array(ClubsByRegionPointSchema),
  })
  .strict()

export type ClubsByRegionHealth = z.infer<typeof ClubsByRegionHealthSchema>
export type ClubsByRegionTier = z.infer<typeof ClubsByRegionTierSchema>
export type ClubsByRegionClub = z.infer<typeof ClubsByRegionClubSchema>
export type ClubsByRegionShard = z.infer<typeof ClubsByRegionShardSchema>
export type ClubsByRegionPoint = z.infer<typeof ClubsByRegionPointSchema>
export type ClubsByRegionWorld = z.infer<typeof ClubsByRegionWorldSchema>
export type ClubsByRegionWorldPoints = z.infer<
  typeof ClubsByRegionWorldPointsSchema
>
export type ClubsByRegionTopMetric =
  (typeof CLUBS_BY_REGION_TOP_METRICS)[number]

export const CLUBS_BY_REGION_SHARD_FORMAT: z.infer<
  typeof ClubsByRegionShardFormatSchema
> = { version: CLUBS_BY_REGION_VERSION, type: 'clubs-by-region-shard' }

export const CLUBS_BY_REGION_WORLD_FORMAT: z.infer<
  typeof ClubsByRegionWorldFormatSchema
> = { version: CLUBS_BY_REGION_VERSION, type: 'clubs-by-region-world' }

export const CLUBS_BY_REGION_WORLD_POINTS_FORMAT: z.infer<
  typeof ClubsByRegionWorldPointsFormatSchema
> = { version: CLUBS_BY_REGION_VERSION, type: 'clubs-by-region-world-points' }
