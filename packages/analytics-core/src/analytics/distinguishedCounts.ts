/**
 * Confirmed / provisional Distinguished classification (#2553). Red stub.
 */

import type { DistinguishedCounts } from '@taverns-red/shared-contracts'
import type { DistinguishedLevel } from '../types.js'

export type DistinguishedCountBasis = 'ti-recognised' | 'april-renewals'

export type CountedDistinguishedLevel = Exclude<
  DistinguishedLevel,
  'NotDistinguished'
>

export interface DistinguishedClassificationInput {
  dcpGoals: number
  membershipCount: number
  membershipBase: number
  aprilRenewals?: number
  cspSubmitted?: boolean
  distinguishedStatus?: string
}

export interface ClubDistinguishedClassification {
  confirmedLevel: CountedDistinguishedLevel | null
  provisionalLevel: CountedDistinguishedLevel | null
}

export interface DistinguishedClassificationOptions {
  snapshotDate: string
  programYear: string
  basis: DistinguishedCountBasis
}

export interface DivisionDistinguishedCounts {
  divisionId: string
  distinguishedCounts: DistinguishedCounts
  areas: Array<{ areaId: string; distinguishedCounts: DistinguishedCounts }>
}

export function distinguishedCountBasis(
  _clubs: readonly Pick<
    DistinguishedClassificationInput,
    'distinguishedStatus'
  >[]
): DistinguishedCountBasis {
  return 'april-renewals'
}

export function classifyClubDistinguished(
  _club: DistinguishedClassificationInput,
  _options: DistinguishedClassificationOptions
): ClubDistinguishedClassification {
  return { confirmedLevel: null, provisionalLevel: null }
}

export function tallyDistinguished(
  _classifications: readonly ClubDistinguishedClassification[]
): DistinguishedCounts {
  const zero = { confirmed: 0, provisional: 0 }
  return {
    confirmed: 0,
    provisional: 0,
    byTier: {
      distinguished: { ...zero },
      select: { ...zero },
      presidents: { ...zero },
      smedley: { ...zero },
    },
  }
}

export function computeDistinguishedCounts(
  _clubs: readonly (DistinguishedClassificationInput & {
    divisionId: string
    areaId: string
  })[],
  _snapshotDate: string
): { district: DistinguishedCounts; divisions: DivisionDistinguishedCounts[] } {
  return { district: tallyDistinguished([]), divisions: [] }
}
