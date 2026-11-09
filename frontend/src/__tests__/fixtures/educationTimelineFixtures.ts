/**
 * Typed education-timeline fixtures (#2592). The district file is plain JSON
 * (`education-timeline-district-61.json`, also what the e2e smoke serves);
 * this parses it with the writer contract so a test cannot drift from the
 * schema, and derives the world and month-grain variants from it.
 */
import {
  EducationTimelineEntitySchema,
  type EducationTimelineEntity,
} from '@taverns-red/shared-contracts'
import district61 from './education-timeline-district-61.json'

export const DISTRICT_61_TIMELINE: EducationTimelineEntity =
  EducationTimelineEntitySchema.parse(district61)

/** The same series as a world file: aggregate points carry `districts`. */
export const WORLD_TIMELINE: EducationTimelineEntity =
  EducationTimelineEntitySchema.parse({
    ...district61,
    entity: { kind: 'world', id: null },
    points: district61.points.map((p, i) => ({ ...p, districts: 70 + i })),
  })

/** The same series as a region file (Region 01). */
export const REGION_01_TIMELINE: EducationTimelineEntity =
  EducationTimelineEntitySchema.parse({
    ...district61,
    entity: { kind: 'region', id: '01' },
    points: district61.points.map((p, i) => ({ ...p, districts: 9 + i })),
  })

/** A district file whose ghost is month-grain (the education ledger history). */
export const MONTH_GRAIN_TIMELINE: EducationTimelineEntity =
  EducationTimelineEntitySchema.parse({
    ...district61,
    prior: {
      programYear: '2025-2026',
      source: 'ledger-history',
      grain: 'month',
      points: [
        { at: '2025-07', total: 5 },
        { at: '2025-08', total: 14 },
        { at: '2025-09', total: 27 },
        { at: '2025-10', total: 41 },
      ],
    },
  })

/** A district file with no prior year (first PY, or no ledger history). */
export const NO_PRIOR_TIMELINE: EducationTimelineEntity =
  EducationTimelineEntitySchema.parse({ ...district61, prior: null })
