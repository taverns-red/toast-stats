import type { RegionRollups } from '@taverns-red/shared-contracts'
import type { DistinguishedCountPair } from './distinguishedCounts'

/* The pipeline's confirmed / qualifying-today pair for the world, a region
   or a district, read from one `region-rollups.json` (#2553, #2580). Pure:
   the caller passes the file it already has (R3). Absent is not zero: a
   block with no `distinguishedCounts` (file written before #2553, or a
   district without the source columns) yields null / no entry. */

export function worldDistinguishedCounts(
  _rollups: RegionRollups | null | undefined
): DistinguishedCountPair | null {
  return null
}

export function regionDistinguishedCounts(
  _rollups: RegionRollups | null | undefined,
  _regionId: string
): DistinguishedCountPair | null {
  return null
}

/** district id → provisional (qualifying-today, unconfirmed) count. */
export function districtProvisionalMap(
  _rollups: RegionRollups | null | undefined
): ReadonlyMap<string, number> {
  return new Map()
}
