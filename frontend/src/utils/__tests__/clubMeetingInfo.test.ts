import { describe, it, expect } from 'vitest'
import {
  buildClubMeetingInfo,
  toastmastersClubPageUrl,
} from '../clubMeetingInfo'

/**
 * #1783 — the club hero's "where it meets" line. Built only from Find-A-Club
 * enrichment already on the ClubTrend. Ron's rule (2026-10-11): show address,
 * meeting day/time, online/hybrid, website and a "Contact on toastmasters.org"
 * link — NEVER email or phone.
 *
 * Fixture values mirror the live CDN record for club 3045 in
 * snapshots/2026-10-10/analytics/district_61_analytics.json (read 2026-10-11),
 * including the trailing space TI leaves on `street` and a free-text
 * meetingDay.
 */
const LIVE_SHAPE = {
  clubId: '3045',
  address: {
    street: '790 Edgar Street, Court Building ',
    city: 'Kingston',
    region: 'ON',
    postalCode: 'K7M 9G5',
    country: 'Canada',
  },
  email: 'someone@example.com',
  phone: '+16135550000',
  website: 'https://limestonetm.com/',
  meetingDay: 'Wed.1st and 3rd in person  (2nd online)',
  meetingTime: '7:30 pm',
  allowsVirtualAttendance: false,
  coordinates: { lat: 44.25, lng: -76.55 },
}

describe('toastmastersClubPageUrl', () => {
  it('links to the club page on toastmasters.org with the 8-digit padded id', () => {
    // Verified live 2026-10-11: /Find-a-Club/00003045 resolves to the club,
    // an unknown id renders "Club not found".
    expect(toastmastersClubPageUrl('3045')).toBe(
      'https://www.toastmasters.org/Find-a-Club/00003045'
    )
    expect(toastmastersClubPageUrl('00000606')).toBe(
      'https://www.toastmasters.org/Find-a-Club/00000606'
    )
    expect(toastmastersClubPageUrl('28675542')).toBe(
      'https://www.toastmasters.org/Find-a-Club/28675542'
    )
  })

  it('returns null for a non-numeric id rather than building a broken link', () => {
    expect(toastmastersClubPageUrl('abc')).toBeNull()
    expect(toastmastersClubPageUrl('')).toBeNull()
  })
})

describe('buildClubMeetingInfo', () => {
  it('builds schedule, mode, place, website and contact link from the live shape', () => {
    const info = buildClubMeetingInfo(LIVE_SHAPE)
    expect(info).toEqual({
      schedule: 'Wed.1st and 3rd in person (2nd online) · 7:30 pm',
      mode: 'In person',
      place: '790 Edgar Street, Court Building, Kingston, ON',
      websiteUrl: 'https://limestonetm.com/',
      contactUrl: 'https://www.toastmasters.org/Find-a-Club/00003045',
    })
  })

  it('never carries email or phone in any field', () => {
    const info = buildClubMeetingInfo(LIVE_SHAPE)
    const serialised = JSON.stringify(info)
    expect(serialised).not.toContain('someone@example.com')
    expect(serialised).not.toContain('6135550000')
    expect(serialised).not.toMatch(/mailto:|tel:/)
  })

  it('labels virtual attendance as online or hybrid', () => {
    const info = buildClubMeetingInfo({
      ...LIVE_SHAPE,
      allowsVirtualAttendance: true,
    })
    expect(info?.mode).toBe('Online or hybrid')
  })

  it('omits the mode when attendance is unknown', () => {
    const { allowsVirtualAttendance: _drop, ...rest } = LIVE_SHAPE
    void _drop
    expect(buildClubMeetingInfo(rest)?.mode).toBeNull()
  })

  it('returns null when the snapshot has no Find-A-Club enrichment', () => {
    // Prod 2026-05-31 and the 09-30 / 10-08 dates carry no FAC fields at all:
    // the line is omitted, never rendered blank.
    expect(buildClubMeetingInfo({ clubId: '3045' })).toBeNull()
  })

  it('treats contact-only enrichment (email/phone) as no line', () => {
    // A record whose only FAC fields are the ones we never show must not
    // produce a line that is just a bare link.
    expect(
      buildClubMeetingInfo({
        clubId: '3045',
        email: 'x@example.com',
        phone: '1',
      })
    ).toBeNull()
  })

  it('drops a website that is not http(s)', () => {
    expect(
      buildClubMeetingInfo({ ...LIVE_SHAPE, website: 'mailto:x@example.com' })
        ?.websiteUrl
    ).toBeNull()
    expect(
      buildClubMeetingInfo({ ...LIVE_SHAPE, website: 'javascript:alert(1)' })
        ?.websiteUrl
    ).toBeNull()
  })

  it('shows the time alone when the day is missing, and vice versa', () => {
    expect(
      buildClubMeetingInfo({ ...LIVE_SHAPE, meetingDay: undefined })?.schedule
    ).toBe('7:30 pm')
    expect(
      buildClubMeetingInfo({ ...LIVE_SHAPE, meetingTime: '  ' })?.schedule
    ).toBe('Wed.1st and 3rd in person (2nd online)')
  })

  it('builds the place from whatever address parts exist', () => {
    expect(
      buildClubMeetingInfo({
        ...LIVE_SHAPE,
        address: { city: 'Ottawa', region: 'ON' },
      })?.place
    ).toBe('Ottawa, ON')
    expect(
      buildClubMeetingInfo({ ...LIVE_SHAPE, address: {} })?.place
    ).toBeNull()
  })
})
