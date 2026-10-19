import { describe, expect, it } from 'vitest'
import {
  ClubStatisticsFileSchema,
  ScrapedRecordSchema,
} from '@taverns-red/shared-contracts'
import { mergeFacIntoSnapshot } from '../FindAClubMerger.js'

/*
 * #2160 — the merger applies the shared club-location rule per district.
 * Real-shape TI Find-A-Club records (District 53, prod 2026-10-18): ids,
 * cities, countries, coordinates and AllowsVirtualAttendance as FAC sends
 * them. No contact field is set.
 */

const tiClub = (
  id: string,
  city: string,
  region: string,
  lat: number,
  lng: number,
  location: string,
  allowsVirtual = true
) => ({
  Identification: { Id: { Value: id } },
  Address: {
    City: city,
    PrimaryRegion: { Value: region },
    Coordinates: { Latitude: lat, Longitude: lng },
  },
  CountryName: 'United States',
  MeetingDay: 'Tuesday',
  MeetingTime: '7:00 pm',
  AllowsVirtualAttendance: allowsVirtual,
  Location: location,
})

const d53Peers = [
  tiClub('00000315', 'Poughkeepsie', 'NY', 41.65899, -73.93067, 'Library'),
  tiClub('00004396', 'Poughkeepsie', 'NY', 41.6615, -73.8898, 'Library'),
  tiClub('00790849', 'Poughkeepsie', 'NY', 41.69412, -73.8904, 'Town Hall'),
  tiClub('00002623', 'Kingston', 'NY', 41.93258, -74.01765, 'Library', false),
  tiClub('00009542', 'Loch Sheldrake', 'NY', 41.76389, -74.6664, 'College'),
  tiClub('01436813', 'Wappingers Falls', 'NY', 41.60679, -73.86324, 'Hall'),
  tiClub('00004507', 'Goshen', 'NY', 41.40425, -74.32391, 'Hybrid, Library'),
]

const row = (clubId: string) => ({
  'Club Number': clubId,
  'Club Name': `Club ${clubId}`,
  Division: 'D',
  Area: '42',
  'Club Status': 'Active',
})

function merge(voya: ReturnType<typeof tiClub>) {
  const all = [...d53Peers, voya]
  const ids = all.map(c => c.Identification.Id.Value)
  return mergeFacIntoSnapshot(
    {
      districtId: '53',
      data: {
        clubPerformance: ids.map(row),
        clubs: ids.map(clubId => ({
          clubId,
          clubName: `Club ${clubId}`,
          divisionId: 'D',
          divisionName: 'Division D',
          areaId: '42',
          areaName: 'Area 42',
          membershipBase: 22,
          octoberRenewals: 0,
          aprilRenewals: 0,
          newMembers: 2,
          membershipCount: 24,
          paymentsCount: 30,
          dcpGoals: 3,
          status: 'Active',
          // A stale point from an earlier merge must not survive.
          coordinates: { lat: 19.18947, lng: 72.95207 },
        })),
      },
    },
    { Clubs: all }
  ).snapshot.data as {
    clubs: Record<string, unknown>[]
    clubPerformance: Record<string, unknown>[]
  }
}

const find = (rows: Record<string, unknown>[], id: string) =>
  rows.find(r => (r['clubId'] ?? r['Club Number']) === id)!

describe('mergeFacIntoSnapshot — club location rule (#2160)', () => {
  it('a fully online club gets meetsOnline and no coordinates (28675595)', () => {
    const data = merge(
      tiClub('28675595', 'Windsor', 'CT', 19.18947, 72.95207, 'Online')
    )
    for (const rows of [data.clubs, data.clubPerformance]) {
      const voya = find(rows, '28675595')
      expect(voya['meetsOnline']).toBe(true)
      expect(voya).not.toHaveProperty('coordinates')
      // Its meeting day and time are kept for the text fallback.
      expect(voya['meetingDay']).toBe('Tuesday')
      expect(voya['meetingTime']).toBe('7:00 pm')
    }
    const parsed = find(data.clubs, '28675595')
    expect(parsed['meetingSchedule']).toMatchObject([
      { day: 'Tuesday', startTime: '19:00', mode: 'online' },
    ])
    const validated = ClubStatisticsFileSchema.safeParse(parsed)
    expect(validated.success).toBe(true)
    // The schema must declare the flag, or parsing strips it.
    expect(validated.data?.meetsOnline).toBe(true)
    expect(
      ScrapedRecordSchema.safeParse(find(data.clubPerformance, '28675595'))
        .success
    ).toBe(true)
  })

  it('an in-person club geocoded across the world gets no coordinates', () => {
    const data = merge(
      tiClub('28675595', 'Windsor', 'CT', 19.18947, 72.95207, 'Library')
    )
    const voya = find(data.clubs, '28675595')
    expect(voya).not.toHaveProperty('coordinates')
    expect(voya).not.toHaveProperty('meetsOnline')
  })

  it('peers and hybrid clubs keep their coordinates', () => {
    const data = merge(
      tiClub('28675595', 'Windsor', 'CT', 19.18947, 72.95207, 'Online')
    )
    expect(find(data.clubs, '00004507')['coordinates']).toEqual({
      lat: 41.40425,
      lng: -74.32391,
    })
    expect(find(data.clubs, '00004507')).not.toHaveProperty('meetsOnline')
    expect(find(data.clubPerformance, '00000315')['coordinates']).toEqual({
      lat: 41.65899,
      lng: -73.93067,
    })
  })
})
