import { describe, it, expect } from 'vitest'
import {
  buildClubMeetingInfo,
  formatMeetingTime,
  isUnreadableFacText,
  meetingWhen,
  toastmastersClubPageUrl,
  UNREADABLE_DAY_NOTE,
  UNREADABLE_SCHEDULE_NOTE,
  UNREADABLE_TIME_NOTE,
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

/**
 * #1879 — Ron's rule (2026-10-12): never display a club's online meeting link
 * (Zoom, Teams, Meet, Webex, GoTo, Jitsi, any direct-entry URL, which may
 * carry a passcode). Show the mode instead; the contact link is the way in.
 *
 * Fixtures are the live records from
 * snapshots/2026-10-10/analytics/district_61_analytics.json (read 2026-10-11).
 * TI's FAC carries the link in `address.street`, not `website`.
 */
const LOS_AMIGOS_ONLINE = {
  clubId: '1009147',
  address: {
    street: 'https://us02web.zoom.us/j/877614736',
    city: 'Ottawa',
    region: 'ON',
    postalCode: 'K1Y1M7',
    country: 'Canada',
  },
  website: 'https://1009147.toastmastersclubs.org/agenda-02291132.html',
  meetingDay: 'Mondays',
  meetingTime: '18:30 - 20:00  Ottawa EST',
  allowsVirtualAttendance: true,
  coordinates: { lat: 45.39933, lng: -75.72548 },
}

const PASSCODE_IN_STREET = {
  clubId: '7396993',
  address: {
    street:
      'https://us06web.zoom.us/j/829949991, MtgID: 829 9499 910 Passcode:826900',
    city: 'Ottawa',
    region: 'ON',
  },
  meetingDay: 'Thursday',
  meetingTime: '7:00PM-8:00PM Zoom opens at 6:45pm',
  allowsVirtualAttendance: true,
}

const MEETING_LINKS = [
  'https://us02web.zoom.us/j/877614736',
  'https://zoom.us/j/123456789?pwd=abc',
  'https://teams.microsoft.com/l/meetup-join/19%3ameeting_x',
  'https://teams.live.com/meet/9876',
  'https://meet.google.com/abc-defg-hij',
  'https://acme.webex.com/meet/club',
  'https://global.gotomeeting.com/join/123456789',
  'https://meet.goto.com/123456789',
  'https://meet.jit.si/OurClub',
]

describe('buildClubMeetingInfo — never a meeting link (#1879)', () => {
  it('drops a Zoom link that TI carries in the street, keeping city and region', () => {
    const info = buildClubMeetingInfo(LOS_AMIGOS_ONLINE)
    expect(info?.place).toBe('Ottawa, ON')
    expect(JSON.stringify(info)).not.toContain('zoom.us')
  })

  it('says the club meets online when its location is a meeting link', () => {
    expect(buildClubMeetingInfo(LOS_AMIGOS_ONLINE)?.mode).toBe('Meets online')
  })

  it('keeps a normal club website and the contact link', () => {
    const info = buildClubMeetingInfo(LOS_AMIGOS_ONLINE)
    expect(info?.websiteUrl).toBe(
      'https://1009147.toastmastersclubs.org/agenda-02291132.html'
    )
    expect(info?.contactUrl).toBe(
      'https://www.toastmasters.org/Find-a-Club/01009147'
    )
  })

  it('never carries a meeting ID or passcode', () => {
    const info = buildClubMeetingInfo(PASSCODE_IN_STREET)
    const serialised = JSON.stringify(info)
    expect(serialised).not.toContain('829949991')
    expect(serialised).not.toContain('826900')
    expect(serialised).not.toMatch(/passcode|mtgid/i)
    // A plain mention of Zoom with no link is not a way in, so it stays.
    expect(info?.schedule).toBe('Thursday · 7:00PM-8:00PM Zoom opens at 6:45pm')
  })

  it.each(MEETING_LINKS)('drops %s from every field', link => {
    const info = buildClubMeetingInfo({
      ...LIVE_SHAPE,
      address: { ...LIVE_SHAPE.address, street: link },
      website: link,
      meetingDay: `Tuesday ${link}`,
      meetingTime: link,
    })
    const host = new URL(link).hostname
    expect(JSON.stringify(info)).not.toContain(host)
    expect(info?.websiteUrl).toBeNull()
  })

  it('drops a scheme-less meeting link too', () => {
    const info = buildClubMeetingInfo({
      ...LIVE_SHAPE,
      address: { ...LIVE_SHAPE.address, street: 'zoom.us/j/877614736' },
    })
    expect(info?.place).toBe('Kingston, ON')
  })

  it('keeps an address that only mentions online meetings in words', () => {
    // Live D61 values (clubs 676481, 5833, 654417): no link, nothing to join.
    for (const street of [
      'Zoom Only',
      'Virtual, Note: Currently meeting with zoom.',
      'Contact us for Zoom Details',
    ]) {
      expect(
        buildClubMeetingInfo({
          ...LIVE_SHAPE,
          address: { street, city: 'Ottawa', region: 'ON' },
        })?.place
      ).toBe(`${street}, Ottawa, ON`)
    }
  })
})

/**
 * #2069 — a scheme-less, shortened meeting link. Club 977's `address.street`
 * in snapshots/2026-10-14/district_201.json on prod (read 2026-10-15) is a
 * "Zoom Link:" label, a bit.ly link, then the street. Link redacted, house
 * number 9s. Already-published files carry it, so the builder must drop it
 * even after the collector stops writing it.
 */
const CLUB_977 = {
  clubId: '977',
  address: {
    street: 'Zoom Link: bit.ly/REDACTED977, 9999 Overland Ave',
    city: 'Culver City',
    region: 'CA',
    postalCode: '99999',
    country: 'United States',
  },
  meetingDay: '1st Thu (online) | 3rd Thu (in-person)',
  meetingTime: '7:00 to 8:30 PM',
  allowsVirtualAttendance: true,
}

const SCHEMELESS_LINKS = [
  'bit.ly/abc123',
  'tinyurl.com/abc123',
  'goo.gl/abc123',
  'rebrand.ly/abc123',
  'forms.gle/abc123',
  'zoom.us/j/99999999',
  'meet.google.com/abc-defg-hij',
  'teams.microsoft.com/l/meetup-join/abc',
  'example.org/meet',
  'clubsite.com',
]

describe('buildClubMeetingInfo — no meeting credential in the place (#2157)', () => {
  // D02 club 7893475 typed its passcode into its city (value redacted).
  it('keeps the city and drops the passcode typed into it', () => {
    const info = buildClubMeetingInfo({
      ...CLUB_977,
      address: { ...CLUB_977.address, city: 'Culver City Passcode: 000000' },
    })
    expect(info?.place).toBe('9999 Overland Ave, Culver City, CA')
    expect(JSON.stringify(info)).not.toMatch(/passcode|000000/i)
  })

  it('keeps a real city that starts with "Pin"', () => {
    const info = buildClubMeetingInfo({
      ...CLUB_977,
      address: { ...CLUB_977.address, city: 'Pine Bluff' },
    })
    expect(info?.place).toBe('9999 Overland Ave, Pine Bluff, CA')
  })
})

describe('buildClubMeetingInfo — no link of any kind in the place (#2069)', () => {
  it("drops club 977's label and bit.ly link and keeps its street", () => {
    const info = buildClubMeetingInfo(CLUB_977)
    expect(info?.place).toBe('9999 Overland Ave, Culver City, CA')
    expect(JSON.stringify(info)).not.toMatch(/bit\.ly|zoom link/i)
  })

  it('keeps the attendance mode when a street is left after the link', () => {
    expect(buildClubMeetingInfo(CLUB_977)?.mode).toBe('Online or hybrid')
  })

  it('keeps the street after a Zoom link (D201 28675725 shape)', () => {
    const info = buildClubMeetingInfo({
      ...LIVE_SHAPE,
      address: {
        street:
          'https://us99web.zoom.us/j/99999999999 9999 Airport Plaza Drive',
        city: 'Los Angeles',
        region: 'CA',
      },
    })
    expect(info?.place).toBe('9999 Airport Plaza Drive, Los Angeles, CA')
  })

  it.each(SCHEMELESS_LINKS)(
    'drops %s from the street, day and time, labelled or not',
    link => {
      const info = buildClubMeetingInfo({
        ...LIVE_SHAPE,
        address: {
          ...LIVE_SHAPE.address,
          street: `Zoom Link: ${link}, 790 Edgar Street`,
        },
        meetingDay: `Tuesday ${link}`,
        meetingTime: `7:30 pm (${link})`,
      })
      expect(info?.place).toBe('790 Edgar Street, Kingston, ON')
      expect(info?.schedule).toBe('Tuesday · 7:30 pm')
      expect(JSON.stringify(info)).not.toContain(link.split('/')[0])
    }
  )

  it('says the club meets online when its street is only a shortened link', () => {
    const info = buildClubMeetingInfo({
      ...CLUB_977,
      address: { ...CLUB_977.address, street: 'bit.ly/REDACTED00' },
    })
    expect(info?.place).toBe('Culver City, CA')
    expect(info?.mode).toBe('Meets online')
  })

  it('drops a shortened website, which may hide a meeting link', () => {
    for (const website of [
      'https://bit.ly/abc123',
      'http://tinyurl.com/abc123',
      'https://www.tinyurl.com/abc123',
    ]) {
      expect(
        buildClubMeetingInfo({ ...LIVE_SHAPE, website })?.websiteUrl
      ).toBeNull()
    }
  })
})

/**
 * #1958 — TI's Find-A-Club `MeetingTime` is free text, copied verbatim. Some
 * clubs type a 24-hour clock with an am/pm suffix: the D61 snapshot of
 * 2026-10-11 has club 8590 "19:30 pm", 1261 "18:45 pm", 2501 "19:00 pm",
 * 7670344 "12:00 - 13:00 PM" and 5097 "18h30 pm et 7:00 am". Render either
 * 12-hour with the suffix or 24-hour without it — never both.
 */
describe('formatMeetingTime (#1958)', () => {
  it.each([
    ['19:30 pm', '7:30 pm'],
    ['18:45 pm', '6:45 pm'],
    ['19:00 PM', '7:00 PM'],
    ['19:30 p.m.', '7:30 p.m.'],
    ['12:00 - 13:00 PM', '12:00 - 1:00 PM'],
    ['18h30 pm et 7:00 am', '6:30 pm et 7:00 am'],
    ['23:15pm', '11:15pm'],
  ])('converts a 24-hour time with a pm suffix: %j → %j', (input, expected) => {
    expect(formatMeetingTime(input)).toBe(expected)
  })

  it('drops a contradictory am suffix from a 24-hour time', () => {
    expect(formatMeetingTime('19:30 am')).toBe('19:30')
  })

  it.each([
    '7:30 pm',
    '12:00 pm',
    '7:00 p.m.',
    '6:30pm-8:15pm',
    '11:45 am - 1pm',
    '6:30 h pm à 8:30 h pm',
  ])('leaves an already-suffixed 12-hour time alone: %j', input => {
    expect(formatMeetingTime(input)).toBe(input)
  })

  it.each(['19:30', '18:30 - 20:00', '19h00', '19 h 00', '17:30 - 19:30 (ET)'])(
    'leaves a 24-hour time without a suffix alone: %j',
    input => {
      expect(formatMeetingTime(input)).toBe(input)
    }
  )

  it('applies in the shared builder the map summary and club hero use', () => {
    expect(
      buildClubMeetingInfo({
        clubId: '8590',
        meetingDay: 'mercredi',
        meetingTime: '19:30 pm',
        allowsVirtualAttendance: false,
      })?.schedule
    ).toBe('mercredi · 7:30 pm')
  })
})

describe('meetingWhen (#2174)', () => {
  it('joins the public day and time with a space, no timezone added', () => {
    expect(
      meetingWhen({ meetingDay: 'Tuesday', meetingTime: '19:30 pm' })
    ).toBe('Tuesday 7:30 pm')
  })

  it('keeps whichever half is known, and is null with neither', () => {
    expect(meetingWhen({ meetingDay: 'Friday' })).toBe('Friday')
    expect(meetingWhen({})).toBeNull()
  })

  it('never shows a meeting link typed into the time', () => {
    expect(
      meetingWhen({
        meetingDay: 'Monday',
        meetingTime: 'https://zoom.us/j/123',
      })
    ).toBe('Monday')
  })
})

/**
 * #2247 — TI's Find-a-Club API sends literal "?" bytes where a club typed
 * CJK text (raw response for D88 06513503: `"MeetingTime":"??2:30-??4:30"`,
 * `"MeetingDay":"???"`). The text is gone upstream. Ron (2026-10-24): never
 * show or parse it; say it is not readable and point to toastmasters.org.
 * Fixtures are the four prod values from the 2026-10-21 census.
 */
describe('isUnreadableFacText (#2247)', () => {
  it.each([
    ['???'],
    ['??'],
    ['??2:30-??4:30'],
    ['??9:30-??12:00'],
    ['??6?'],
    ['?'],
    [' ? ? '],
  ])('treats %j as unreadable', text => {
    expect(isUnreadableFacText(text)).toBe(true)
  })

  it.each([
    ['6:30 - 8:30 PM'],
    ['7:30 pm'],
    ['Tuesday'],
    // A stray "?" next to real words or a real time is still readable.
    ['Tuesday?'],
    ['Mon ??'],
    ['1st & 3rd Wed ???'],
    ['7:30?'],
    ['19:00 ?'],
    // Real CJK text, should TI ever store it, is letters: readable.
    ['下午2:30-下午4:30'],
    ['星期三'],
    ['12:00 - 13:00'],
  ])('keeps %j as readable', text => {
    expect(isUnreadableFacText(text)).toBe(false)
  })
})

describe('buildClubMeetingInfo — unreadable meeting text (#2247)', () => {
  const D88_06513503 = {
    clubId: '06513503',
    meetingDay: '???',
    meetingTime: '??2:30-??4:30',
    allowsVirtualAttendance: false,
    coordinates: { lat: 25.03, lng: 121.56 },
  }

  it('never renders the "?" text and says the time is not readable', () => {
    const info = buildClubMeetingInfo(D88_06513503)
    expect(info).not.toBeNull()
    expect(info?.schedule).toBeNull()
    expect(info?.scheduleNote).toBe(UNREADABLE_SCHEDULE_NOTE)
    expect(UNREADABLE_SCHEDULE_NOTE).toBe(
      'Meeting time not readable — see toastmasters.org'
    )
    expect(JSON.stringify(info)).not.toContain('??')
    expect(info?.contactUrl).toBe(
      'https://www.toastmasters.org/Find-a-Club/06513503'
    )
  })

  // Ron (2026-10-24, PR #2267): keep the readable half and name the other.
  it('keeps a readable time whose day is unreadable (D88 07166169)', () => {
    const info = buildClubMeetingInfo({
      clubId: '07166169',
      meetingDay: '???',
      meetingTime: '6:30 - 8:30 PM',
    })
    expect(info?.schedule).toBe('6:30 - 8:30 PM')
    expect(info?.scheduleNote).toBe(UNREADABLE_DAY_NOTE)
    expect(UNREADABLE_DAY_NOTE).toBe('day not readable — see toastmasters.org')
    expect(JSON.stringify(info)).not.toContain('?')
  })

  it('keeps a readable day whose time is unreadable', () => {
    const info = buildClubMeetingInfo({
      clubId: '1234',
      meetingDay: 'Wednesday',
      meetingTime: '??7:30',
    })
    expect(info?.schedule).toBe('Wednesday')
    expect(info?.scheduleNote).toBe(UNREADABLE_TIME_NOTE)
    expect(UNREADABLE_TIME_NOTE).toBe(
      'time not readable — see toastmasters.org'
    )
  })

  it('hides an unreadable time next to a "??" day (D128 05789778)', () => {
    const info = buildClubMeetingInfo({
      clubId: '05789778',
      meetingDay: '??',
      meetingTime: '??6?',
    })
    expect(info?.schedule).toBeNull()
    expect(info?.scheduleNote).toBe(UNREADABLE_SCHEDULE_NOTE)
  })

  it('carries no note for readable text, even with a stray "?"', () => {
    const info = buildClubMeetingInfo({
      clubId: '3045',
      meetingDay: 'Tuesday?',
      meetingTime: '7:30 pm',
    })
    expect(info?.schedule).toBe('Tuesday? · 7:30 pm')
    expect(info?.scheduleNote).toBeUndefined()
  })

  it('meetingWhen gives the note instead of the "?" text', () => {
    expect(meetingWhen(D88_06513503)).toBe(UNREADABLE_SCHEDULE_NOTE)
    expect(meetingWhen({ meetingDay: '??', meetingTime: '7:00 pm' })).toBe(
      '7:00 pm · day not readable — see toastmasters.org'
    )
    expect(meetingWhen({ meetingDay: 'Friday', meetingTime: '??6?' })).toBe(
      'Friday · time not readable — see toastmasters.org'
    )
  })
})
