import type { RegionRollups } from '@taverns-red/shared-contracts'
import type { DistinguishedCountPair } from './distinguishedCounts'

/* The pipeline's confirmed / qualifying-today pair for the world, a region
   or a district, read from one `region-rollups.json` (#2553, #2580). Pure:
   the caller passes the file it already has (R3). Absent is not zero: a
   block with no `distinguishedCounts` (file written before #2553, or a
   district without the source columns) yields null / no entry. */

const pair = (
  c: { confirmed: number; provisional: number } | null | undefined
): DistinguishedCountPair | null =>
  c ? { confirmed: c.confirmed, provisional: c.provisional } : null

export function worldDistinguishedCounts(
  rollups: RegionRollups | null | undefined
): DistinguishedCountPair | null {
  return pair(rollups?.world.distinguishedCounts)
}

export function regionDistinguishedCounts(
  rollups: RegionRollups | null | undefined,
  regionId: string
): DistinguishedCountPair | null {
  return pair(rollups?.regions?.[regionId]?.distinguishedCounts)
}

/** region id → provisional (qualifying-today, unconfirmed) count. */
export function regionProvisionalMap(
  rollups: RegionRollups | null | undefined
): ReadonlyMap<string, number> {
  const out = new Map<string, number>()
  for (const [id, r] of Object.entries(rollups?.regions ?? {})) {
    if (r.distinguishedCounts) out.set(id, r.distinguishedCounts.provisional)
  }
  return out
}

/** district id → provisional (qualifying-today, unconfirmed) count. */
export function districtProvisionalMap(
  rollups: RegionRollups | null | undefined
): ReadonlyMap<string, number> {
  const out = new Map<string, number>()
  for (const [id, d] of Object.entries(rollups?.districts ?? {})) {
    if (d.distinguishedCounts) out.set(id, d.distinguishedCounts.provisional)
  }
  return out
}
