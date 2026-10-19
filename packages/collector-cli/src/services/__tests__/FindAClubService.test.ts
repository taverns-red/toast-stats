import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  FindAClubService,
  normaliseDistrictParam,
  parseNetDate,
  normaliseTiClub,
} from '../FindAClubService.js'

/* Fixtures based on the real TI response observed 2026-05-11 (see
   tasks/430-find-a-club-recipe-2026-05-11.md). */

const realClub = {
  Identification: {
    Id: {
      Value: '00001399',
      DisplayFriendlyFormat: '1399',
      Name: 'South Suburban Toastmasters ',
    },
    Name: 'South Suburban Toastmasters ',
  },
  Address: {
    Street: '2630 W Belleview Ave, Ste 100',
    City: 'Littleton',
    PrimaryRegion: { Value: 'CO' },
    PrimaryRegionDescription: 'Colorado',
    PostalCode: '80123',
    Coordinates: { Longitude: -105.01863, Latitude: 39.62285 },
    TimeZone: null,
  },
  Classification: {
    Club: null,
    Area: { Id: null, Name: '03' },
    Division: { Id: null, Name: 'M' },
    District: { Id: null, Name: '26' },
  },
  CountryName: 'United States',
  CharterDate: '/Date(197190000000)/',
  Email: 'club-100@example.com',
  FacebookLink: 'https://www.facebook.com/SouthSuburbanTM1399',
  TwitterLink: null,
  IsProspective: false,
  Location: 'TOAST Fine Food and Coffee',
  MeetingDay: 'Thursday',
  MeetingTime: '7:00 am ',
  HasUpcomingEvent: false,
  Phone: '+15550190000',
  Restriction: [],
  Website: 'http://1399.toastmastersclubs.org/',
  AllowsVirtualAttendance: false,
  Note: '',
}

describe('normaliseDistrictParam', () => {
  it('zero-pads single-digit numeric districts', () => {
    expect(normaliseDistrictParam('1')).toBe('01')
    expect(normaliseDistrictParam('7')).toBe('07')
  })

  it('leaves two-and-three-digit numeric districts unchanged', () => {
    expect(normaliseDistrictParam('26')).toBe('26')
    expect(normaliseDistrictParam('117')).toBe('117')
  })

  it('uppercases letter districts', () => {
    expect(normaliseDistrictParam('u')).toBe('U')
    expect(normaliseDistrictParam('U')).toBe('U')
  })

  it('trims whitespace', () => {
    expect(normaliseDistrictParam(' 26 ')).toBe('26')
  })
})

describe('parseNetDate', () => {
  it('parses /Date(ms)/ to ISO YYYY-MM-DD', () => {
    expect(parseNetDate('/Date(197190000000)/')).toBe('1976-04-01')
  })

  it('handles negative epoch (pre-1970)', () => {
    // 1962-01-01 UTC = -252460800000ms
    expect(parseNetDate('/Date(-252460800000)/')).toBe('1962-01-01')
  })

  it('returns undefined for non-string / unparseable / out-of-band input', () => {
    expect(parseNetDate(null)).toBeUndefined()
    expect(parseNetDate('')).toBeUndefined()
    expect(parseNetDate('1976-04-01')).toBeUndefined() // ISO, not .NET
    expect(parseNetDate('/Date(abc)/')).toBeUndefined()
    // Sanity bounds — year < 1900
    expect(parseNetDate('/Date(-9999999999999)/')).toBeUndefined()
  })

  // #486 L3: extreme finite values produce Invalid Date, whose
  // getUTCFullYear() returns NaN. NaN compared with anything is false,
  // so the year-band check is no defence; toISOString() then throws.
  it('returns undefined for extreme-magnitude ms (Invalid Date)', () => {
    expect(parseNetDate('/Date(99999999999999999999)/')).toBeUndefined()
    expect(parseNetDate('/Date(-99999999999999999999)/')).toBeUndefined()
  })
})

describe('normaliseTiClub', () => {
  it('flattens a real TI club into the enrichment shape', () => {
    const result = normaliseTiClub(realClub)
    expect(result).toEqual({
      clubId: '00001399',
      clubName: 'South Suburban Toastmasters',
      charterDate: '1976-04-01',
      coordinates: { lat: 39.62285, lng: -105.01863 },
      address: {
        street: '2630 W Belleview Ave, Ste 100',
        city: 'Littleton',
        region: 'CO',
        postalCode: '80123',
        country: 'United States',
      },
      email: 'club-100@example.com',
      phone: '+15550190000',
      website: 'http://1399.toastmastersclubs.org/',
      facebookLink: 'https://www.facebook.com/SouthSuburbanTM1399',
      meetingDay: 'Thursday',
      meetingTime: '7:00 am',
      allowsVirtualAttendance: false,
      isProspective: false,
      location: 'TOAST Fine Food and Coffee',
      meetingSchedule: [
        {
          day: 'Thursday',
          cadence: 'weekly',
          startTime: '07:00',
          mode: 'in-person',
        },
      ],
    })
  })

  // #1789 — Location is kept, scrubbed of contact details and meeting
  // access, and meetingSchedule[] is parsed from the day/time/location.
  it('keeps a scrubbed Location and parses per-week modes (#1789)', () => {
    const result = normaliseTiClub({
      ...realClub,
      MeetingDay: 'Wed.1st and 3rd in person  (2nd online) ',
      MeetingTime: '7:30 pm',
      Location:
        'Trillium Centre<br>Zoom: https://us02web.zoom.us/j/00000000000?pwd=PLACEHOLDER (TEL: 555-0100)',
    })
    expect(result?.location).toBe('Trillium Centre\nZoom')
    expect(result?.meetingSchedule).toEqual([
      {
        day: 'Wednesday',
        cadence: 'monthly',
        weeksOfMonth: [1, 3],
        startTime: '19:30',
        mode: 'in-person',
      },
      {
        day: 'Wednesday',
        cadence: 'monthly',
        weeksOfMonth: [2],
        startTime: '19:30',
        mode: 'online',
      },
    ])
  })

  it('omits location and meetingSchedule when nothing public or parseable is left (#1789)', () => {
    const result = normaliseTiClub({
      ...realClub,
      MeetingDay: 'https://example.toastmastersclubs.org/',
      Location:
        'https://us02web.zoom.us/j/00000000000?pwd=PLACEHOLDER<br>club-contact@example.org',
    })
    expect(result).not.toHaveProperty('location')
    expect(result).not.toHaveProperty('meetingSchedule')
  })

  // #2069 — TI's Address.Street is free text too: club 977 (D201, prod
  // 2026-10-14) typed a shortened Zoom link before its street. Link
  // redacted, house numbers 9s.
  it('drops a scheme-less meeting link and its label from the street (#2069)', () => {
    const result = normaliseTiClub({
      ...realClub,
      Address: {
        ...realClub.Address,
        Street: 'Zoom Link: bit.ly/REDACTED977, 9999 Overland Ave',
      },
    })
    expect(result?.address?.street).toBe('9999 Overland Ave')
    expect(result?.address?.city).toBe('Littleton')
  })

  it('omits a street that is only a meeting link and its credentials (#2069)', () => {
    for (const Street of [
      'bit.ly/REDACTED00',
      'https://us99web.zoom.us/j/99999999999, MtgID: 999 9999 999 Passcode:999999',
    ]) {
      const result = normaliseTiClub({
        ...realClub,
        Address: { ...realClub.Address, Street },
      })
      expect(result?.address).not.toHaveProperty('street')
      expect(result?.address?.city).toBe('Littleton')
    }
  })

  it('drops a link from the meeting day and time text (#2069)', () => {
    const result = normaliseTiClub({
      ...realClub,
      MeetingDay: 'Tuesday, see example.toastmastersclubs.org/agenda',
      MeetingTime: '7:00 pm bit.ly/REDACTED00',
    })
    expect(result?.meetingDay).toBe('Tuesday, see')
    expect(result?.meetingTime).toBe('7:00 pm')
  })

  // #2157 — club 7893475 (D02) typed its meeting passcode into its CITY.
  // Value redacted; the shape is "<city> Passcode: <digits>".
  it('scrubs a meeting credential out of the city at ingest (#2157)', () => {
    const result = normaliseTiClub({
      ...realClub,
      Address: { ...realClub.Address, City: 'Littleton Passcode: 000000' },
    })
    expect(result?.address?.city).toBe('Littleton')
  })

  it('omits a city, region or postal code that is only a credential (#2157)', () => {
    const result = normaliseTiClub({
      ...realClub,
      Address: {
        ...realClub.Address,
        City: 'Passcode: 000000',
        PrimaryRegion: { Value: 'Meeting ID: 000 0000 0000' },
        PostalCode: 'PIN 0000',
      },
    })
    expect(result?.address).not.toHaveProperty('city')
    expect(result?.address).not.toHaveProperty('region')
    expect(result?.address).not.toHaveProperty('postalCode')
  })

  it('keeps a real city that merely starts with "Pin" (#2157)', () => {
    for (const City of ['Pinner', 'Pine Bluff']) {
      const result = normaliseTiClub({
        ...realClub,
        Address: { ...realClub.Address, City },
      })
      expect(result?.address?.city).toBe(City)
    }
  })

  it('scrubs a credential out of the meeting day and time (#2157)', () => {
    const result = normaliseTiClub({
      ...realClub,
      MeetingDay: 'Tuesday Meeting ID: 000 0000 0000',
      MeetingTime: '7:00 pm Password: 000000',
    })
    expect(result?.meetingDay).toBe('Tuesday')
    expect(result?.meetingTime).toBe('7:00 pm')
  })

  // #2153 — TI's sentinel for an ungeocoded club. Shape observed in
  // raw-fac/2026-10-18/district_49.json (Pathways Central, Honolulu):
  // the address is present but Coordinates is exactly { 0, 0 }.
  it('treats the (0, 0) ungeocoded sentinel as no coordinates (#2153)', () => {
    const out = normaliseTiClub({
      Identification: {
        Id: {
          Value: '07787643',
          DisplayFriendlyFormat: '7787643',
          Name: 'Pathways Central',
        },
        Name: 'Pathways Central',
      },
      Address: {
        City: 'Honolulu ',
        PrimaryRegion: { Value: 'HI' },
        Coordinates: { Longitude: 0, Latitude: 0 },
      },
      CountryName: 'United States',
    } as unknown as Parameters<typeof normaliseTiClub>[0])
    expect(out).not.toBeNull()
    expect(out!.coordinates).toBeUndefined()
    expect(out!.address?.city).toBe('Honolulu ')
  })

  it('drops out-of-range coordinates (#2153)', () => {
    const out = normaliseTiClub({
      ...realClub,
      Address: {
        ...realClub.Address,
        Coordinates: { Longitude: -105.01863, Latitude: 391.2 },
      },
    })
    expect(out!.coordinates).toBeUndefined()
  })

  it('returns null when the club is missing its primary key', () => {
    expect(
      normaliseTiClub({
        Identification: { Id: { Value: null } },
      } as any)
    ).toBeNull()
    expect(normaliseTiClub({} as any)).toBeNull()
  })

  it('omits optional fields that TI returns as null / missing', () => {
    const sparse = {
      Identification: { Id: { Value: '00009999' } },
      Address: null,
      CharterDate: null,
      Email: null,
      Phone: null,
    }
    expect(normaliseTiClub(sparse as any)).toEqual({ clubId: '00009999' })
  })
})

describe('FindAClubService', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let service: FindAClubService

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({
        Clubs: [realClub],
        district: '26',
      }),
    } as unknown as Response)
    service = new FindAClubService({
      fetchImpl: fetchMock as unknown as typeof fetch,
      requestIntervalMs: 0, // no throttle in tests
    })
  })

  it('builds the URL with anchor coords, radius, and zero-padded district', () => {
    expect(service.buildUrl('1')).toBe(
      'https://www.toastmasters.org/api/sitecore/FindAClub/Search?latitude=39.6478&longitude=-104.9878&radius=5000&district=01'
    )
    expect(service.buildUrl('26')).toContain('district=26')
    expect(service.buildUrl('U')).toContain('district=U')
  })

  it('fetches a district, validates the response, and returns clubs', async () => {
    const result = await service.fetchDistrict('26')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(result.clubs).toHaveLength(1)
    expect(result.clubs[0]?.clubId).toBe('00001399')
    expect(result.clubs[0]?.charterDate).toBe('1976-04-01')
  })

  it('throws on non-OK HTTP status', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as unknown as Response)
    await expect(service.fetchDistrict('26')).rejects.toThrow(
      /HTTP 500.*district 26/
    )
  })

  it('throws on schema-invalid response payload', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({ Clubs: 'not an array' }),
    } as unknown as Response)
    await expect(service.fetchDistrict('26')).rejects.toThrow()
  })

  it('treats Clubs: null as zero clubs (TI returns this for invalid filters)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({ Clubs: null, district: '01' }),
    } as unknown as Response)
    const result = await service.fetchDistrict('1')
    expect(result.clubs).toEqual([])
  })

  it('throttles consecutive requests to at least requestIntervalMs apart', async () => {
    const throttled = new FindAClubService({
      fetchImpl: fetchMock as unknown as typeof fetch,
      requestIntervalMs: 30,
    })
    const start = Date.now()
    await throttled.fetchDistrict('26')
    await throttled.fetchDistrict('27')
    await throttled.fetchDistrict('28')
    const elapsed = Date.now() - start
    // Allow some slack; with intervalMs=30 across 3 requests we expect ~60ms minimum
    // (the first request doesn't wait, subsequent two do)
    expect(elapsed).toBeGreaterThanOrEqual(50)
  })
})
