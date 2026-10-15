import type {
  ClubDistrictHistoryClub,
  ClubDistrictHistoryShard,
} from '@taverns-red/shared-contracts'

export interface ClosedClubSummary {
  lastDistrictId: string
  lastSeen: string
  closedYear: number
}

export function findClubInShard(
  _shard: ClubDistrictHistoryShard,
  _clubId: string
): ClubDistrictHistoryClub | undefined {
  throw new Error('not implemented (#1806 red)')
}

export function transferCounterpartDistrict(
  _club: ClubDistrictHistoryClub,
  _direction: 'in' | 'out',
  _pys: { fromProgramYear: string; toProgramYear: string },
  _districtId: string
): string | null {
  throw new Error('not implemented (#1806 red)')
}

export function closedClubSummary(
  _club: ClubDistrictHistoryClub
): ClosedClubSummary | null {
  throw new Error('not implemented (#1806 red)')
}
