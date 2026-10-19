import { describe, expect, it } from 'vitest'
import {
  meetsOnlyOnline,
  resolveClubLocations,
  type ClubLocationInput,
} from '../geo/clubLocation.js'

/*
 * Real-shape fixtures (#2160): club ids, cities, countries, FAC coordinates,
 * AllowsVirtualAttendance and parsed meeting modes as they appear in the
 * prod 2026-10-18 district files. No contact field is read or needed.
 */

type Mode = 'in-person' | 'online' | 'hybrid'
const club = (
  clubId: string,
  city: string,
  lat: number,
  lng: number,
  modes: Mode[] = ['in-person'],
  allowsVirtualAttendance = true,
  country = 'United States'
): ClubLocationInput => ({
  clubId,
  coordinates: { lat, lng },
  address: { city, country },
  allowsVirtualAttendance,
  meetingSchedule: modes.map(mode => ({ day: 'Tuesday' as const, mode })),
})

/** District 53 (Hudson Valley / Connecticut), in-person clubs. */
const d53 = [
  club('315', 'Poughkeepsie', 41.65899, -73.93067),
  club('4396', 'Poughkeepsie', 41.6615, -73.8898),
  club('790849', 'Poughkeepsie', 41.69412, -73.8904),
  club('2623', 'Kingston', 41.93258, -74.01765, ['in-person'], false),
  club('4507', 'Goshen', 41.40425, -74.32391, ['hybrid']),
  club('9542', 'Loch Sheldrake', 41.76389, -74.6664),
  club('1436813', 'Wappingers Falls', 41.60679, -73.86324),
]

/** 28675595: address Windsor, CT; FAC point in Thane, India. */
const voyaInPerson = club('28675595', 'Windsor', 19.18947, 72.95207)

describe('meetsOnlyOnline (#2160)', () => {
  it('is true when FAC allows virtual attendance and every meeting is online', () => {
    expect(
      meetsOnlyOnline(
        club('28675595', 'Windsor', 19.18947, 72.95207, ['online'])
      )
    ).toBe(true)
  })

  it('is false for a hybrid club, which keeps its pin', () => {
    expect(
      meetsOnlyOnline(club('4507', 'Goshen', 41.4, -74.3, ['hybrid']))
    ).toBe(false)
    expect(
      meetsOnlyOnline(club('1', 'Goshen', 41.4, -74.3, ['online', 'in-person']))
    ).toBe(false)
  })

  it('is false when FAC says the club does not allow virtual attendance', () => {
    expect(
      meetsOnlyOnline(club('1', 'Kingston', 41.9, -74.0, ['online'], false))
    ).toBe(false)
  })

  it('falls back to a city of "Virtual" / "Online" only when no meeting mode is known', () => {
    const noMode = (city: string): ClubLocationInput => ({
      clubId: '1633651',
      coordinates: { lat: 30.2, lng: -97.7 },
      address: { city, country: 'United States' },
      allowsVirtualAttendance: true,
    })
    expect(meetsOnlyOnline(noMode('Virtual'))).toBe(true)
    expect(meetsOnlyOnline(noMode('Online'))).toBe(true)
    expect(meetsOnlyOnline(noMode('Austin'))).toBe(false)
    // A known in-person schedule wins over the place text.
    expect(
      meetsOnlyOnline(club('5829986', 'Virtual', 37.24, -121.79, ['in-person']))
    ).toBe(false)
  })
})

describe('resolveClubLocations (#2160)', () => {
  it('drops a geocode far from the rest of its district and country (28675595)', () => {
    const out = resolveClubLocations([...d53, voyaInPerson])
    expect(out.get('28675595')).toEqual({
      mapped: false,
      reason: 'geocode-outlier',
    })
    expect(out.get('315')).toEqual({
      mapped: true,
      coordinates: { lat: 41.65899, lng: -73.93067 },
    })
  })

  it('a fully online club is unmapped whatever its point', () => {
    const online = club('28676558', 'West Point', 41.39149, -73.95574, [
      'online',
    ])
    const out = resolveClubLocations([...d53, online])
    expect(out.get('28676558')).toEqual({
      mapped: false,
      reason: 'meets-online',
    })
  })

  it('keeps a far but clustered part of a district (District 2, Alaska)', () => {
    const washington = [
      club('626', 'Lynden', 48.94004, -122.47072),
      club('4470', 'Bellingham', 48.7859, -122.49095, ['hybrid']),
      club('590628', 'Blaine', 48.99321, -122.73668),
      club('1383833', 'Bellingham', 48.7735, -122.44451, ['hybrid']),
      club('2537', 'Anacortes', 48.51561, -122.61216),
      club('4617', 'Mount Vernon', 48.41942, -122.33586, ['hybrid']),
      club('9001', 'Seattle', 47.6062, -122.3321),
      club('9002', 'Seattle', 47.61, -122.34),
      club('9003', 'Everett', 47.979, -122.2021),
      club('9004', 'Bellevue', 47.6101, -122.2015),
    ]
    const alaska = [
      club('5263', 'Fairbanks', 64.82695, -147.71374),
      club('586026', 'Fairbanks', 64.84525, -147.72476),
      club('6654670', 'North Pole', 64.76135, -147.34721, ['in-person'], false),
      club('3069', 'Anchorage', 61.2181, -149.9003),
    ]
    // 28678078: "Bellevue" geocoded to Delaware — isolated, so dropped.
    const bellevueDe = club('28678078', 'Bellevue', 39.139, -75.541)
    const out = resolveClubLocations([...washington, ...alaska, bellevueDe])
    for (const c of alaska) expect(out.get(c.clubId)?.mapped).toBe(true)
    expect(out.get('28678078')).toEqual({
      mapped: false,
      reason: 'geocode-outlier',
    })
  })

  it('judges a club only against clubs with the same address country', () => {
    // District 116 (Qatar) with one club whose address really is Houston:
    // its point agrees with its own country, so it is not an outlier.
    const doha = Array.from({ length: 6 }, (_, i) =>
      club(
        `11600${i}`,
        'Doha',
        25.28 + i * 0.01,
        51.52,
        ['in-person'],
        true,
        'Qatar'
      )
    )
    const houston = club('7848571', 'Houston', 29.683, -95.521)
    // 28678353: "Doha" geocoded to Miami — the Qatar group rejects it.
    const dohaInMiami = club(
      '28678353',
      'Doha',
      25.834,
      -80.193,
      ['in-person'],
      true,
      'Qatar'
    )
    const out = resolveClubLocations([...doha, houston, dohaInMiami])
    expect(out.get('7848571')?.mapped).toBe(true)
    expect(out.get('28678353')).toEqual({
      mapped: false,
      reason: 'geocode-outlier',
    })
  })

  it('does not judge a group too small to have a centre', () => {
    const out = resolveClubLocations([d53[0]!, d53[1]!, voyaInPerson])
    expect(out.get('28675595')?.mapped).toBe(true)
  })

  it('applies the #2153 rule first: (0, 0) and missing points are unmapped', () => {
    const out = resolveClubLocations([
      club('7908109', 'Jeddah', 0, 0),
      { clubId: '99', address: { city: 'Nowhere' } },
    ])
    expect(out.get('7908109')).toEqual({
      mapped: false,
      reason: 'no-coordinates',
    })
    expect(out.get('99')).toEqual({ mapped: false, reason: 'no-coordinates' })
  })
})
