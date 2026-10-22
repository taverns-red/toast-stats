/**
 * #1789 — FAC Location is kept (scrubbed) and meetingSchedule[] is parsed
 * from the free-text MeetingDay / MeetingTime / Location.
 *
 * The table cases are the RECORDED D61 vocabulary (raw-fac/2026-10-12,
 * fixtures/fac-d61-2026-10-12); the fixture-wide cases run every recorded
 * row through the parser and the scrubber.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MeetingScheduleEntrySchema } from '@taverns-red/shared-contracts'
import {
  parseMeetingSchedule,
  scrubFacLocation,
  scrubFacStreet,
  meetingModeFromText,
} from '../FacMeetingSchedule.js'

interface VocabRow {
  MeetingDay: string | null
  MeetingTime: string | null
  Location: string | null
  AllowsVirtualAttendance: boolean | null
}

const vocabulary: VocabRow[] = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures/fac-d61-2026-10-12/meeting-vocabulary.json'),
    'utf-8'
  )
)

/** No email, URL, meeting host, credential or 7+ digit phone-like run. */
function assertNoContactOrAccess(text: string): void {
  expect(text).not.toMatch(/@/)
  expect(text).not.toMatch(/https?:|www\./i)
  expect(text).not.toMatch(/zoom\.us|teams\.microsoft|meet\.google/i)
  expect(text).not.toMatch(/\b[a-z0-9-]+\.[a-z]{2,}\/|bit\.ly/i)
  expect(text).not.toMatch(/pwd|passcode|password|mtg\s*id|meeting\s*id/i)
  const digitRuns = text.match(/\+?\(?\d[\d ().-]*\d/g) ?? []
  for (const run of digitRuns) {
    expect(run.replace(/\D/g, '').length).toBeLessThan(7)
  }
}

describe('scrubFacLocation (#1789)', () => {
  it.each([
    ['Online', 'Online'],
    ['Sandy Hill Community Center', 'Sandy Hill Community Center'],
    [
      'OPG Saunders Hydro Dam Visitor Centre<br>2500 Second St W, Cornwall, ON K6H 5R6',
      'OPG Saunders Hydro Dam Visitor Centre\n2500 Second St W, Cornwall, ON K6H 5R6',
    ],
    [
      'Scotia Bank Building <br>8th Floor (use elevator)',
      'Scotia Bank Building\n8th Floor (use elevator)',
    ],
    ['Barley Mow, Westboro<br> ', 'Barley Mow, Westboro'],
    ["Restaurant L'Ambroisie (TEL: 555-0100)", "Restaurant L'Ambroisie"],
    [
      'Rencontres virtuelles / Virtual meeting<br>https://us02web.zoom.us/j/00000000000?pwd=PLACEHOLDER',
      'Rencontres virtuelles / Virtual meeting',
    ],
    [
      'Exlusivement via Zoom<br>Online meetings: https://us02web.zoom.us/j/00000000000?pwd=PLACEHOLDER',
      'Exlusivement via Zoom\nOnline meetings',
    ],
    [
      "St-Mary's Church - Parish Hall (lower)<br>See Directions at: https://example.toastmastersclubs.org/",
      "St-Mary's Church - Parish Hall (lower)\nSee Directions at",
    ],
    [
      'Richcraft Recreation Complex<br>Zoom (Please contact club-contact@example.org to RSVP)',
      'Richcraft Recreation Complex\nZoom',
    ],
    // Synthetic shapes the recorded day does not contain.
    ['Room 4, MtgID: 000 0000 000 Passcode: 000000', 'Room 4'],
    ['Room 12 +1 (555) 010-0199', 'Room 12'],
    // A contact instruction is not a meeting place, and it is where clubs
    // name a person or a messaging handle (seen in D02/D91/D101/D85 on
    // raw-fac/2026-10-12): the parenthetical, or else the whole line, goes.
    ['Hybrid (Contact Us)', 'Hybrid'],
    ['Online and In-Person (Call for details)', 'Online and In-Person'],
    ['Library<br>Virtual- Contact Alex for link', 'Library'],
    ['Office Tower<br>Sam Example (@samexample)', 'Office Tower'],
    ['Hall B<br>c/o Pat Example', 'Hall B'],
    ['Wechat ID: EXAMPLE<br>Community Room', 'Community Room'],
    [
      "In-Person Weekly, Monday's @ Parkview Estates: 3rd Floor Theatre Room",
      "In-Person Weekly, Monday's @ Parkview Estates: 3rd Floor Theatre Room",
    ],
    // Street numbers next to an ordinal street are not a phone number.
    [
      '12345 67th Ave W, Lynnwood, WA 98000',
      '12345 67th Ave W, Lynnwood, WA 98000',
    ],
    ['Library<br>zoom.us/j/00000000000', 'Library'],
    ['Hall<br>Password = abc123', 'Hall'],
    // #2069 — a scheme-less shortened Zoom link and its label (club 977,
    // D201, prod 2026-10-14; link redacted, house number 9s).
    ['Zoom Link: bit.ly/REDACTED977, 9999 Overland Ave', '9999 Overland Ave'],
    ['Hall<br>tinyurl.com/abc123', 'Hall'],
    // A passcode typed as prose (D201 street shape, prod 2026-10-14).
    [
      'Hall, Zoom Meeting ID 00000000000, Zoom Passcode is 000000',
      'Hall, Zoom, Zoom',
    ],
    ['Hall<br>Meeting link: example.org/meet', 'Hall'],
  ])('%j → %j', (raw, expected) => {
    expect(scrubFacLocation(raw)).toBe(expected)
  })

  it.each([
    [
      'https://us02web.zoom.us/j/00000000000?pwd=PLACEHOLDER<br>https://us02web.zoom.us/j/00000000000?pwd=PLACEHOLDER',
    ],
    [
      'ZOOM -contact club-contact@example.org<br>ZOOM - contact club-contact@example.org for link',
    ],
    ['Call +1 (555) 010-0199 for the room'],
    ['  '],
    ['<br>'],
  ])('returns undefined when nothing public is left: %j', raw => {
    expect(scrubFacLocation(raw)).toBeUndefined()
  })

  it('returns undefined for a missing Location', () => {
    expect(scrubFacLocation(null)).toBeUndefined()
    expect(scrubFacLocation(undefined)).toBeUndefined()
  })

  it('leaves no contact detail or meeting access in any recorded D61 Location', () => {
    for (const row of vocabulary) {
      const scrubbed = scrubFacLocation(row.Location)
      if (scrubbed !== undefined) assertNoContactOrAccess(scrubbed)
    }
  })
})

/**
 * #2069 — FAC Address.Street. Shapes recorded from prod
 * snapshots/2026-10-14 (D201, D61, D101, D85, D91, U; read 2026-10-15),
 * with links, names and numbers replaced by placeholders.
 */
describe('scrubFacStreet (#2069)', () => {
  it.each([
    ['Zoom Link: bit.ly/REDACTED977, 9999 Overland Ave', '9999 Overland Ave'],
    ['999 W 999th St, bit.ly/REDACTED00', '999 W 999th St'],
    ['9999 Barber Ln, https://us99web.zoom.us/j/99999999999', '9999 Barber Ln'],
    ['West, https://club.toastmastersclubs.org/ ', 'West'],
    ['Call with questions:  555-010-0199', 'Call with questions'],
    ['Zoom Meeting ID 00000000000, Zoom Passcode is 000000', 'Zoom, Zoom'],
    ['Tencent Meeting: 000 0000 0000', 'Tencent Meeting'],
    // #2157 residue: double-spaced id groups and a "PW" passcode.
    ['Zoom ID:  000  0000  0000   PW:0000, 9 Main St', '9 Main St'],
    ['99999 Oak Rd. ,  Mtg ID: 00000000000  pw 000000', '99999 Oak Rd.'],
    // #2167: a labelled 8-digit phone is under the 9-digit run floor.
    ['9 Main St, Tel: 55550100', '9 Main St'],
    ['Tel 55550100, 9 Main St', '9 Main St'],
    ['9 Main St, Phone 5555 0100', '9 Main St'],
  ])('%j → %j', (raw, expected) => {
    expect(scrubFacStreet(raw)).toBe(expected)
  })

  it.each([
    ['bit.ly/REDACTED00'],
    ['Mtg ID: 00000000000  pw 000000'],
    [
      'https://us99web.zoom.us/j/999999999, MtgID: 999 9999 999 Passcode:999999',
    ],
    ['club-1@example.com'],
    // A contact instruction is not a place; the person-name heuristic
    // shared with Location also drops this D91 shape.
    ['Enquiry via EMAIL ONLY, club-1@example.com'],
    // A contact instruction naming a person (D101 shape).
    ['contact Pat Example for Zoom link, pat@example.com  '],
  ])('returns undefined when nothing public is left: %j', raw => {
    expect(scrubFacStreet(raw)).toBeUndefined()
  })

  it.each([
    // Verbatim, trailing space and odd punctuation included: a street with
    // no link or access detail is not rewritten.
    ['790 Edgar Street, Court Building '],
    ['999 S. Aviation Blvd, , #999'],
    ['-'],
    ['Zoom (Please email for zoom link)'],
    // Quebec unit-civic numbers are not phone numbers.
    ['100-1234 Chemin de la Cote St. Luc'],
    ['23300 58th Ave W'],
    ['Suite 1200, 9 Main St'],
    ['PC World, 12-34 Main St'],
    ['Room 3-401, Building 7'],
  ])('keeps %j unchanged', raw => {
    expect(scrubFacStreet(raw)).toBe(raw)
  })
})

describe('meetingModeFromText (#1789)', () => {
  it.each([
    ['Online', 'online'],
    ['Online via Zoom', 'online'],
    ['MS Teams Meetings On-Line Only.\nBombardier Administration', 'online'],
    ['Statistics Canada\nNote: Online meetings', 'online'],
    ['Réunion en ligne depuis le Covid-19', 'online'],
    ['EDC Ottawa Toastmasters meets virtually', 'online'],
    ['South Fallingbrook Community Center\nOnline - Hybrid', 'hybrid'],
    ['Overbrook Community Centre\nZoom & in-person hybrid meetings', 'hybrid'],
    ['Café du Mille-Lieux\nHybride (lien sur demande)', 'hybrid'],
    ['Online over Zoom\nOccasional In person meeting', 'hybrid'],
    ['Reunion en personne et hybride sur Teams', 'hybrid'],
    ['Sandy Hill Community Center', 'in-person'],
    [
      ' Point de service Emile-Loranger\nPrésentiel : Point de service Émile-Loranger (presbytère)',
      'in-person',
    ],
  ])('location %j → %s', (text, mode) => {
    expect(meetingModeFromText(text, { place: true })).toBe(mode)
  })

  it.each([['Contact us'], ['To be determined'], ['1500'], ['']])(
    'location %j carries no mode signal',
    text => {
      expect(meetingModeFromText(text, { place: true })).toBeUndefined()
    }
  )

  it('a plain day/time text with no mode word carries no signal', () => {
    expect(meetingModeFromText('Tuesday 7:00 pm')).toBeUndefined()
    expect(meetingModeFromText('Thursday - Virtual')).toBe('online')
    expect(
      meetingModeFromText('7PM-weekly alternating virtual/in-person')
    ).toBe('hybrid')
  })
})

describe('parseMeetingSchedule (#1789) — recorded D61 vocabulary', () => {
  it.each([
    [
      'Tuesday',
      '7:30 pm',
      [{ day: 'Tuesday', cadence: 'weekly', startTime: '19:30' }],
    ],
    [
      'Tuesdays',
      '6:30 p.m.',
      [{ day: 'Tuesday', cadence: 'weekly', startTime: '18:30' }],
    ],
    [
      'Tues.',
      '12:00 p.m.',
      [{ day: 'Tuesday', cadence: 'weekly', startTime: '12:00' }],
    ],
    [
      'Fri',
      '12:00 - 1:00 p.m. (EST)',
      [
        {
          day: 'Friday',
          cadence: 'weekly',
          startTime: '12:00',
          endTime: '13:00',
        },
      ],
    ],
    [
      'Monday',
      '18:45 pm',
      [{ day: 'Monday', cadence: 'weekly', startTime: '18:45' }],
    ],
    [
      'Jeudi',
      '19:00 pm',
      [{ day: 'Thursday', cadence: 'weekly', startTime: '19:00' }],
    ],
    [
      'Mardi',
      '18h45',
      [{ day: 'Tuesday', cadence: 'weekly', startTime: '18:45' }],
    ],
    [
      'Jeudi soir (de septembre à mai)',
      '19 h 00',
      [{ day: 'Thursday', cadence: 'weekly', startTime: '19:00' }],
    ],
    [
      'Mardi',
      '19 h',
      [{ day: 'Tuesday', cadence: 'weekly', startTime: '19:00' }],
    ],
    [
      'Friday',
      '12h30 - 13h30',
      [
        {
          day: 'Friday',
          cadence: 'weekly',
          startTime: '12:30',
          endTime: '13:30',
        },
      ],
    ],
    [
      'Wednesday (mercredi)',
      '6:30 h pm à 8:30 h pm',
      [
        {
          day: 'Wednesday',
          cadence: 'weekly',
          startTime: '18:30',
          endTime: '20:30',
        },
      ],
    ],
    [
      'Wednesday',
      '07:15 - 08:30 EDT',
      [
        {
          day: 'Wednesday',
          cadence: 'weekly',
          startTime: '07:15',
          endTime: '08:30',
        },
      ],
    ],
    [
      'Tuesdays',
      '12:00 - 13:00 PM',
      [
        {
          day: 'Tuesday',
          cadence: 'weekly',
          startTime: '12:00',
          endTime: '13:00',
        },
      ],
    ],
    [
      'Friday',
      '11:05 a.m to 11:55 a.m. ET',
      [
        {
          day: 'Friday',
          cadence: 'weekly',
          startTime: '11:05',
          endTime: '11:55',
        },
      ],
    ],
    [
      'Tuesday',
      'noon EST/EDT UTC- 4 (opens at 11:45am)',
      [{ day: 'Tuesday', cadence: 'weekly', startTime: '12:00' }],
    ],
    [
      'Jeudi/Thursday',
      '12 noon/midi',
      [{ day: 'Thursday', cadence: 'weekly', startTime: '12:00' }],
    ],
    [
      'Thursday',
      '7:30 pm, link opens 7:15PM',
      [{ day: 'Thursday', cadence: 'weekly', startTime: '19:30' }],
    ],
    [
      'Thurs.',
      '6:30 pm (1hr meetings) ',
      [{ day: 'Thursday', cadence: 'weekly', startTime: '18:30' }],
    ],
    [
      'Mondays',
      '12:05  pm - 1 p.m.',
      [
        {
          day: 'Monday',
          cadence: 'weekly',
          startTime: '12:05',
          endTime: '13:00',
        },
      ],
    ],
    [
      'Thursdays',
      '7 pm -  9 pm',
      [
        {
          day: 'Thursday',
          cadence: 'weekly',
          startTime: '19:00',
          endTime: '21:00',
        },
      ],
    ],
    [
      'Tuesdays',
      '12:00',
      [{ day: 'Tuesday', cadence: 'weekly', startTime: '12:00' }],
    ],
    [
      'First and Third Saturdays',
      '9:30-11:30 AM Eastern - UTC-5 | -4DT',
      [
        {
          day: 'Saturday',
          cadence: 'monthly',
          weeksOfMonth: [1, 3],
          startTime: '09:30',
          endTime: '11:30',
        },
      ],
    ],
    [
      '1st, 3rd & 5th Tuesday of each month',
      '7:00 pm - 9:00 pm (ET)',
      [
        {
          day: 'Tuesday',
          cadence: 'monthly',
          weeksOfMonth: [1, 3, 5],
          startTime: '19:00',
          endTime: '21:00',
        },
      ],
    ],
    [
      'Saturday 1st and 3rd of each month',
      '9:00 am  EST',
      [
        {
          day: 'Saturday',
          cadence: 'monthly',
          weeksOfMonth: [1, 3],
          startTime: '09:00',
        },
      ],
    ],
    [
      'Thursday (1st and 3rd)',
      '18:30 - 20:00',
      [
        {
          day: 'Thursday',
          cadence: 'monthly',
          weeksOfMonth: [1, 3],
          startTime: '18:30',
          endTime: '20:00',
        },
      ],
    ],
    [
      'Second Wednesday',
      '12:00 pm',
      [
        {
          day: 'Wednesday',
          cadence: 'monthly',
          weeksOfMonth: [2],
          startTime: '12:00',
        },
      ],
    ],
    [
      '2nd & 4th Tuesdays, Monthly',
      '6:30 pm',
      [
        {
          day: 'Tuesday',
          cadence: 'monthly',
          weeksOfMonth: [2, 4],
          startTime: '18:30',
        },
      ],
    ],
    [
      'Every Second Monday',
      '12:00 - 12:40 PM',
      [
        {
          day: 'Monday',
          cadence: 'biweekly',
          startTime: '12:00',
          endTime: '12:40',
        },
      ],
    ],
    [
      'Thursdays (Bi-weekly)',
      '7:00 pm - 8:40 pm  EST',
      [
        {
          day: 'Thursday',
          cadence: 'biweekly',
          startTime: '19:00',
          endTime: '20:40',
        },
      ],
    ],
    [
      'Un samedi sur deux',
      '14h @ UTC-5',
      [{ day: 'Saturday', cadence: 'biweekly', startTime: '14:00' }],
    ],
    [
      'Mercredi au 2 semaine',
      '12:00 - 13:00',
      [
        {
          day: 'Wednesday',
          cadence: 'biweekly',
          startTime: '12:00',
          endTime: '13:00',
        },
      ],
    ],
    [
      'Alternating Tuesdays/Thursdays',
      '12:00 pm',
      [
        { day: 'Tuesday', cadence: 'biweekly', startTime: '12:00' },
        { day: 'Thursday', cadence: 'biweekly', startTime: '12:00' },
      ],
    ],
    [
      'Tuesday & Wednesday',
      '9:00 am',
      [
        { day: 'Tuesday', cadence: 'weekly', startTime: '09:00' },
        { day: 'Wednesday', cadence: 'weekly', startTime: '09:00' },
      ],
    ],
    [
      'Mercredi et Jeudi',
      '18h30 pm et 7:00 am',
      [
        { day: 'Wednesday', cadence: 'weekly', startTime: '18:30' },
        { day: 'Thursday', cadence: 'weekly', startTime: '07:00' },
      ],
    ],
    // The day is known but not how often: cadence is left out, not guessed.
    [
      'Twice a month - Thursday - No guests',
      '6:45 - 8:15 p.m.',
      [{ day: 'Thursday', startTime: '18:45', endTime: '20:15' }],
    ],
    [
      'most Mondays (check webpage)',
      '1 p.m. EST',
      [{ day: 'Monday', startTime: '13:00' }],
    ],
  ])('%j / %j', (meetingDay, meetingTime, expected) => {
    expect(parseMeetingSchedule({ meetingDay, meetingTime })).toEqual(expected)
  })

  it('splits per-week modes: "Wed.1st and 3rd in person  (2nd online) "', () => {
    expect(
      parseMeetingSchedule({
        meetingDay: 'Wed.1st and 3rd in person  (2nd online) ',
        meetingTime: '7:30 pm',
        location:
          'Trillium Centre\nIn Person for 1st and 3rd Wednesdays - Online 2nd Wednesdays',
      })
    ).toEqual([
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

  it('splits per-week modes: "2nd (Virtual) and 4th (Hybrid) Thursday"', () => {
    expect(
      parseMeetingSchedule({
        meetingDay: '2nd (Virtual) and 4th (Hybrid) Thursday',
        meetingTime: '7:00 pm - 9:00 pm',
      })
    ).toEqual([
      {
        day: 'Thursday',
        cadence: 'monthly',
        weeksOfMonth: [2],
        startTime: '19:00',
        endTime: '21:00',
        mode: 'online',
      },
      {
        day: 'Thursday',
        cadence: 'monthly',
        weeksOfMonth: [4],
        startTime: '19:00',
        endTime: '21:00',
        mode: 'hybrid',
      },
    ])
  })

  it('a mode word in the day or time text beats the location', () => {
    expect(
      parseMeetingSchedule({
        meetingDay: 'Every Friday - online',
        meetingTime: '12:15 pm',
        location: 'Sandy Hill Community Center',
      })
    ).toEqual([
      { day: 'Friday', cadence: 'weekly', startTime: '12:15', mode: 'online' },
    ])
    expect(
      parseMeetingSchedule({
        meetingDay: 'Wednesdays',
        meetingTime: '7PM-weekly alternating virtual/in-person',
        location: 'Salle du Monastere\n5th floor',
      })
    ).toEqual([
      {
        day: 'Wednesday',
        cadence: 'weekly',
        startTime: '19:00',
        mode: 'hybrid',
      },
    ])
  })

  it('falls back to the location for the mode', () => {
    expect(
      parseMeetingSchedule({
        meetingDay: 'Thursday',
        meetingTime: '12:00 pm',
        location: 'Online',
      })
    ).toEqual([
      {
        day: 'Thursday',
        cadence: 'weekly',
        startTime: '12:00',
        mode: 'online',
      },
    ])
    expect(
      parseMeetingSchedule({
        meetingDay: 'Monday',
        meetingTime: '7:00 pm',
        location: 'College Saint-Charles-Garnier',
      })
    ).toEqual([
      {
        day: 'Monday',
        cadence: 'weekly',
        startTime: '19:00',
        mode: 'in-person',
      },
    ])
  })

  it('reads the mode from the raw Location, even when no public line is left', () => {
    expect(
      parseMeetingSchedule({
        meetingDay: 'Tuesday',
        meetingTime: '7:00 pm',
        location:
          'ZOOM -contact club-contact@example.org<br>ZOOM - contact club-contact@example.org for link',
      })
    ).toEqual([
      { day: 'Tuesday', cadence: 'weekly', startTime: '19:00', mode: 'online' },
    ])
    // ...but an email alone is not a place.
    expect(
      parseMeetingSchedule({
        meetingDay: 'Tuesday',
        meetingTime: '7:00 pm',
        location: 'club-contact@example.org',
      })
    ).toEqual([{ day: 'Tuesday', cadence: 'weekly', startTime: '19:00' }])
  })

  it('leaves an ambiguous bare 12-hour time out rather than guess am/pm', () => {
    expect(
      parseMeetingSchedule({ meetingDay: 'Monday', meetingTime: '6:30' })
    ).toEqual([{ day: 'Monday', cadence: 'weekly' }])
  })

  it.each([
    ['https://example.toastmastersclubs.org/', '6:30 pm'],
    [null, null],
    [undefined, '7:00 pm'],
    ['', ''],
  ])('no weekday in %j → no schedule (counted unknown downstream)', (d, t) => {
    expect(
      parseMeetingSchedule({ meetingDay: d, meetingTime: t })
    ).toBeUndefined()
  })
})

describe('parseMeetingSchedule (#2243) — dot as the minute separator', () => {
  it.each([
    ['7.30 pm to 9.00pm AT', '19:30', '21:00'],
    ['7.00 pm - 8.30 pm', '19:00', '20:30'],
    ['7.30pm', '19:30', undefined],
    ['19.30', '19:30', undefined],
    ['18.45 - 20.15', '18:45', '20:15'],
  ])('%j → starts %s', (time, startTime, endTime) => {
    expect(
      parseMeetingSchedule({ meetingDay: 'Tuesday', meetingTime: time })
    ).toEqual([
      {
        day: 'Tuesday',
        cadence: 'weekly',
        startTime,
        ...(endTime ? { endTime } : {}),
      },
    ])
  })

  it.each([['00pm'], ['00 pm'], ['0 am'], ['9.00x pm']])(
    'an unreadable time %j → time not stated, never 00:00',
    time => {
      expect(
        parseMeetingSchedule({ meetingDay: 'Tuesday', meetingTime: time })
      ).toEqual([{ day: 'Tuesday', cadence: 'weekly' }])
    }
  )

  it('a dotted time with no am/pm under 13 stays unstated (no guess)', () => {
    expect(
      parseMeetingSchedule({ meetingDay: 'Tuesday', meetingTime: '7.30' })
    ).toEqual([{ day: 'Tuesday', cadence: 'weekly' }])
  })
})

/** Start times only: the slot the heatmap counts. */
function starts(meetingDay: string, meetingTime: string): string[] {
  return (parseMeetingSchedule({ meetingDay, meetingTime }) ?? []).map(
    e => `${e.day} ${e.startTime ?? '?'}`
  )
}

describe('parseMeetingSchedule (#2243) — a bare hour starting a range', () => {
  it.each([
    ['7 - 9 pm', '19:00'],
    ['7-9 PM', '19:00'],
    ['3-5 PM', '15:00'],
    ['2 -3 PM', '14:00'],
    ['7 to 9:15 p.m.', '19:00'],
    ['1-2:00pm', '13:00'],
    ['6-7:30 pm AT', '18:00'],
    ['12-1 PM CET', '12:00'],
    ['11-1 pm', '11:00'],
  ])('%j starts at %s, not at the end hour', (time, start) => {
    expect(starts('Tuesday', time)).toEqual([`Tuesday ${start}`])
  })

  it.each([['UTC-5 - 7 pm'], ['GMT+6 - 7 pm'], ['1hr - 7 pm']])(
    'an offset or duration before a range %j is not a start',
    time => {
      expect(starts('Tuesday', time)).toEqual(['Tuesday 19:00'])
    }
  )
})

describe("parseMeetingSchedule (#2243) — 'A for B': the meeting starts at B", () => {
  it.each([
    ['5:45 pm for 6:00 pm', '18:00'],
    ['6:45 pm for 7:00pm start', '19:00'],
    ['7.30 for 7:45 pm', '19:45'],
    ['5.45 for a 6 pm start', '18:00'],
    ['9:15 for 09:30', '09:30'],
    ['18h15 for 18h30', '18:30'],
    ['6:45 p.m. (for 7pm start)', '19:00'],
    ['8:45 am for 9:00 am to 11:am UTC+2', '09:00'],
    ['7:15pm for a 7.30 start', '19:30'],
  ])('%j starts at %s', (time, start) => {
    expect(starts('Wednesday', time)).toEqual([`Wednesday ${start}`])
  })

  it('keeps the end of the range after the start', () => {
    expect(
      parseMeetingSchedule({
        meetingDay: 'Thursday',
        meetingTime: '6:15 for 6:30  to 8h30 PM',
      })
    ).toEqual([
      {
        day: 'Thursday',
        cadence: 'weekly',
        startTime: '18:30',
        endTime: '20:30',
      },
    ])
  })
})

describe('parseMeetingSchedule (#1789) — every recorded D61 row', () => {
  const WEEKDAY_WORD =
    /\b(mon|tue|wed|thu|fri|sat|sun|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/i

  it('every entry validates against the strict shared-contracts schema', () => {
    for (const row of vocabulary) {
      const schedule = parseMeetingSchedule({
        meetingDay: row.MeetingDay,
        meetingTime: row.MeetingTime,
        location: scrubFacLocation(row.Location),
      })
      for (const entry of schedule ?? []) {
        expect(MeetingScheduleEntrySchema.safeParse(entry).success).toBe(true)
      }
    }
  })

  it('every row whose day text names a weekday yields a schedule', () => {
    const misses = vocabulary.filter(
      row =>
        row.MeetingDay !== null &&
        WEEKDAY_WORD.test(row.MeetingDay) &&
        parseMeetingSchedule({
          meetingDay: row.MeetingDay,
          meetingTime: row.MeetingTime,
        }) === undefined
    )
    expect(misses.map(r => r.MeetingDay)).toEqual([])
  })
})
