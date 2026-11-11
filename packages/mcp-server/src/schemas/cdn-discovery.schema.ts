/**
 * Read-schemas for the CDN discovery / routing layer.
 *
 * These files (`v1/latest.json`, `v1/dates.json`, the `config/*` indices) are
 * the CDN's own presentation/manifest layout — they do NOT correspond to a
 * collector write-contract in `shared-contracts`, so the thin reader defines
 * its own minimal read-schemas here. Validation is intentionally permissive:
 * Zod strips unknown keys (e.g. the `_format` envelope), so it asserts the
 * fields the client actually reads without coupling to the full manifest shape.
 *
 * Core analytics files that DO map to a write-contract are validated with the
 * shared schema directly (see cdn-rankings.schema.ts and CdnClient).
 */
import { z } from 'zod'
import { ISO_DATE_RE as ISO_DATE } from './common.js'

/** `v1/latest.json` — pointer to the current snapshot date. */
export const LatestManifestSchema = z.object({
  latestSnapshotDate: z.string().regex(ISO_DATE),
  generatedAt: z.string().optional(),
})
export type LatestManifest = z.infer<typeof LatestManifestSchema>

/** `v1/dates.json` — every available snapshot date, oldest-first. */
export const DatesIndexSchema = z.object({
  dates: z.array(z.string().regex(ISO_DATE)),
})
export type DatesIndex = z.infer<typeof DatesIndexSchema>

/** `config/district-snapshot-index.json` — per-district available dates. */
export const DistrictSnapshotIndexSchema = z.object({
  generatedAt: z.string().optional(),
  districts: z.record(z.string(), z.array(z.string().regex(ISO_DATE))),
})
export type DistrictSnapshotIndex = z.infer<typeof DistrictSnapshotIndexSchema>

/** A single `config/club-index.json` entry. */
export const ClubIndexEntrySchema = z.object({
  districtId: z.string(),
  clubName: z.string(),
})
export type ClubIndexEntry = z.infer<typeof ClubIndexEntrySchema>

/** `config/club-index.json` — resolve a club id to its district. */
export const ClubIndexSchema = z.object({
  generatedAt: z.string().optional(),
  snapshotDate: z.string().regex(ISO_DATE).optional(),
  totalClubs: z.number().optional(),
  clubs: z.record(z.string(), ClubIndexEntrySchema),
})
export type ClubIndex = z.infer<typeof ClubIndexSchema>

/**
 * `snapshots/{date}/analytics/district_{id}_analytics.json` — only the
 * published `distinguishedCounts` pair is read (spike #2605). Tolerant: the
 * shared `DistinguishedCountsSchema` is strict, so the reader takes the two
 * counts it shows and drops everything else (#2493).
 */
const CountSchema = z.number().int().nonnegative()
export const AnalyticsDistinguishedSchema = z
  .object({
    // The file is a `{ metadata, data }` envelope; the counts live in `data`.
    data: z.object({
      distinguishedCounts: z
        .object({ confirmed: CountSchema, provisional: CountSchema })
        .nullable()
        .optional(),
    }),
  })
  .transform(d => ({ counts: d.data.distinguishedCounts ?? null }))
export type AnalyticsDistinguished = z.infer<
  typeof AnalyticsDistinguishedSchema
>
