/**
 * District snapshot card data (spike #2605). Field projection only: every
 * number is a pre-computed snapshot/analytics field read from the CDN.
 * Distinguished is reported as published ({confirmed, provisional}, never
 * summed) or `null` when the analytics file does not carry it.
 */
import type { CdnClient } from '../cdn/CdnClient.js'
import { resolveDate } from './tools.js'

export interface DistrictCard {
  districtId: string
  snapshotDate: string
  totalClubs: number
  membership: number
  payments: number
  distinguished: { confirmed: number; provisional: number } | null
  sources: string[]
}

export type DistrictCardResult =
  | { available: true; card: DistrictCard }
  | { available: false; reason: string; sourceUrl: string }

export async function buildDistrictCard(
  client: CdnClient,
  districtId: string,
  date?: string
): Promise<DistrictCardResult> {
  const resolved = await resolveDate(client, date)
  if (!resolved.ok) {
    const env = JSON.parse(resolved.error.content[0]!.text) as {
      sourceUrl: string
      reason: string
    }
    return { available: false, ...env }
  }
  const snap = await client.getDistrictSnapshot(districtId, resolved.date)
  if (!snap.available) {
    return {
      available: false,
      reason: snap.reason,
      sourceUrl: snap.sourceUrl,
    }
  }
  const counts = await client.getDistrictDistinguishedCounts(
    districtId,
    snap.data.data.snapshotDate
  )
  const published = counts.available ? counts.data.counts : null
  const { totals } = snap.data.data
  return {
    available: true,
    card: {
      districtId: snap.data.data.districtId,
      snapshotDate: snap.data.data.snapshotDate,
      totalClubs: totals.totalClubs,
      membership: totals.totalMembership,
      payments: totals.totalPayments,
      distinguished: published
        ? {
            confirmed: published.confirmed,
            provisional: published.provisional,
          }
        : null,
      sources: [snap.sourceUrl, counts.sourceUrl],
    },
  }
}
