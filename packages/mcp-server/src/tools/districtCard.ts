/** District snapshot card data (spike #2605). */
import type { CdnClient } from '../cdn/CdnClient.js'

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
  _client: CdnClient,
  _districtId: string,
  _date?: string
): Promise<DistrictCardResult> {
  throw new Error('not implemented')
}
