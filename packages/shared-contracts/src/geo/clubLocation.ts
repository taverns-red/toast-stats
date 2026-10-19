import type { LatLng } from './coordinates.js'

export interface ClubLocationInput {
  clubId: string
  coordinates?: unknown
  address?: { city?: string; country?: string }
  allowsVirtualAttendance?: boolean
  meetingSchedule?: ReadonlyArray<{ mode?: 'in-person' | 'online' | 'hybrid' }>
}

export type ClubLocation =
  | { mapped: true; coordinates: LatLng }
  | {
      mapped: false
      reason: 'no-coordinates' | 'meets-online' | 'geocode-outlier'
    }

export function meetsOnlyOnline(_club: ClubLocationInput): boolean {
  throw new Error('not implemented (#2160)')
}

export function resolveClubLocations(
  _clubs: readonly ClubLocationInput[]
): Map<string, ClubLocation> {
  throw new Error('not implemented (#2160)')
}
