/**
 * Club operational-status diff (#1247).
 *
 * Stub — RED phase. Returns no events so the spec fails on assertions (not on
 * compilation). The real derivation lands in the GREEN commit.
 *
 * @module diffClubStatus
 */

import type {
  DistrictStatisticsFile,
  DiffEvent,
} from '@toastmasters/shared-contracts'

export function diffClubStatus(
  _from: DistrictStatisticsFile,
  _to: DistrictStatisticsFile
): DiffEvent[] {
  return []
}
