import type {
  ClosedClubNameIndex,
  ReinstatableClubs,
  SuspendedClubs,
} from '@taverns-red/shared-contracts'

export interface BuildReinstatableClubsInput {
  snapshotDate: string
  suspended: SuspendedClubs
  closed: ClosedClubNameIndex
  previousSuspended?: SuspendedClubs | null
}

export function buildReinstatableClubs(
  _input: BuildReinstatableClubsInput
): ReinstatableClubs {
  throw new Error('not implemented')
}
