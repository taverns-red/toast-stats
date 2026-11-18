/**
 * Stub for the reinstatable-clubs contract (#3007). The real schema follows
 * the red tests.
 */

import { z } from 'zod'

export const ReinstatableClubsSchema = z.any()
export const ReinstatableClubsFormatSchema = z.any()
export const ReinstatableClubSchema = z.any()
export type ReinstatableClubsFormat = { version: string; type: string }
export type ReinstatableClubs = {
  _format: { version: string; type: 'reinstatable-clubs' }
  snapshotDate: string
  baseProgramYear: string
  districts: Record<string, ReinstatableClub[]>
}
export type ReinstatableClub = {
  clubNumber: string
  clubName: string
  division?: string
  area?: string
  status: 'suspended' | 'closed'
  suspendDate?: string
  lastSeen?: string
  oldestPeriod: boolean
  addsToBase: boolean
  reason: string
}
export const REINSTATABLE_CLUBS_FORMAT = {
  version: '0.0.0',
  type: 'reinstatable-clubs',
} as const
export const REINSTATABLE_CLUBS_FILE_NAME = ''
