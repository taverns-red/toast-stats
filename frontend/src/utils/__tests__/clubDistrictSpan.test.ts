/**
 * #1804 — which district a club was in for a program year, and how the club
 * page says so when the URL names another one. Fixture: the recorded prod
 * shard 77 (asOf 2026-10-14), club 977: District 01 until 2026-06-30, then
 * District 201.
 */
import { describe, it, expect } from 'vitest'
import type { ClubDistrictHistoryClub } from '@taverns-red/shared-contracts'
import shard77 from '../../__tests__/fixtures/club-district-history-77-2026-10-14.recorded.json'
import {
  clubDistrictNotice,
  currentDistrictOf,
  districtForProgramYear,
  movedAfterDate,
  sameDistrictId,
} from '../clubDistrictSpan'

const CLUB_977 = shard77.clubs['977'] as ClubDistrictHistoryClub

describe('districtForProgramYear (#1804)', () => {
  it("reads the PY's district from byProgramYear", () => {
    expect(districtForProgramYear(CLUB_977, '2024-2025')).toBe('01')
    expect(districtForProgramYear(CLUB_977, '2026-2027')).toBe('201')
  })

  it('is null for a PY the club was not seen in', () => {
    expect(districtForProgramYear(CLUB_977, '2010-2011')).toBeNull()
    expect(districtForProgramYear(null, '2024-2025')).toBeNull()
  })
})

describe('currentDistrictOf (#1804)', () => {
  it("is the last span's district", () => {
    expect(currentDistrictOf(CLUB_977)).toBe('201')
    expect(currentDistrictOf(null)).toBeNull()
  })
})

describe('sameDistrictId', () => {
  it('compares numeric ids padding-tolerantly', () => {
    expect(sameDistrictId('01', '1')).toBe(true)
    expect(sameDistrictId('201', '01')).toBe(false)
    expect(sameDistrictId('f', 'F')).toBe(true)
  })
})

describe('movedAfterDate (#1804)', () => {
  it('is the last sighting in the district the club left', () => {
    expect(movedAfterDate(CLUB_977, '01', '201')).toBe('June 30, 2026')
  })

  it('is null when the history shows no such move', () => {
    expect(movedAfterDate(CLUB_977, '201', '01')).toBeNull()
    expect(movedAfterDate(null, '01', '201')).toBeNull()
  })
})

describe('clubDistrictNotice (#1804)', () => {
  it('says where the club was for a pre-move year', () => {
    expect(
      clubDistrictNotice(CLUB_977, {
        urlDistrictId: '201',
        shownDistrictId: '01',
        programYearLabel: '2024-2025',
      })
    ).toEqual({
      headline: 'In 2024–25 this club was in District 1.',
      detail: 'Showing its District 1 figures for 2024–25.',
      openLabel: 'Open as District 1',
    })
  })

  it('carries the move date when the URL names the district it left', () => {
    expect(
      clubDistrictNotice(CLUB_977, {
        urlDistrictId: '01',
        shownDistrictId: '201',
        programYearLabel: '2026-2027',
      })
    ).toEqual({
      headline: 'This club moved to District 201 after June 30, 2026.',
      detail: 'Showing its District 201 figures for 2026–27.',
      openLabel: 'Open as District 201',
    })
  })
})
