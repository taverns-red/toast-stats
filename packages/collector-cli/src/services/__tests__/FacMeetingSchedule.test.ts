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

  it.each([
    ['GMT+5.30 7 pm', '19:00'],
    ['UTC +5.30, 7:00 pm', '19:00'],
    ['$7.50 7 pm', '19:00'],
    ['Rm 3.15, 7:00 pm', '19:00'],
    ['Fee 12.50, 7pm', '19:00'],
  ])('a decimal before the time in %j is not a time', (time, start) => {
    expect(starts('Tuesday', time)).toEqual([`Tuesday ${start}`])
  })

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
    ['Saturday- 7-8:30PM', '19:00'],
  ])('%j starts at %s, not at the end hour', (time, start) => {
    expect(starts('Tuesday', time)).toEqual([`Tuesday ${start}`])
  })

  it.each([
    ['Room 3 - 7 pm', '19:00'],
    ['Level 3 - 6:30 PM', '18:30'],
    ['Floor 2 - 7:00 pm', '19:00'],
    ['Week 2 - 7 pm', '19:00'],
    ['Sesion 1 - 7 pm', '19:00'],
    ['Sala 2 a 7 pm', '19:00'],
    ['Unit 7 - 8 pm', '20:00'],
    ['Planta 2 - 19:00', '19:00'],
    ['2 - 7 pm', '19:00'],
  ])('a label number before a dash in %j is not a start', (time, start) => {
    expect(starts('Tuesday', time)).toEqual([`Tuesday ${start}`])
  })

  it.each([
    ['Thursdays 7-9 pm', '19:00'],
    ['from 7 - 9 pm', '19:00'],
    ['1st & 3rd 6-7:30 pm', '18:00'],
  ])('a bare start after a day or "from" in %j still counts', (time, start) => {
    expect(starts('Tuesday', time)).toEqual([`Tuesday ${start}`])
  })

  it.each([
    ['UTC-5 - 7 pm'],
    ['GMT+6 - 7 pm'],
    ['GMT + 6 - 7 pm'],
    ['1hr - 7 pm'],
  ])('an offset or duration before a range %j is not a start', time => {
    expect(starts('Tuesday', time)).toEqual(['Tuesday 19:00'])
  })
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

  it.each([
    ['6:00 pm for 2:00 hrs', '18:00'],
    ['7:00 pm for 2.00 hrs', '19:00'],
    ['7 pm for 1h30', '19:00'],
    ['7:00 pm for 01:30', '19:00'],
    ['7:00 pm for 1:30', '19:00'],
    ['7 pm for 90 minutes', '19:00'],
  ])('a duration after "for" in %j is not the start', (time, start) => {
    expect(starts('Wednesday', time)).toEqual([`Wednesday ${start}`])
  })

  it('12 noon for 12.15 starts at 12:15', () => {
    expect(starts('Wednesday', '12 noon for 12.15')).toEqual([
      'Wednesday 12:15',
    ])
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

describe('parseMeetingSchedule (#2243) — Spanish weekday names', () => {
  it.each([
    ['Lunes', 'Monday'],
    ['MARTES', 'Tuesday'],
    ['Miércoles', 'Wednesday'],
    ['miercoles', 'Wednesday'],
    ['Jueves (Hora Cancun)', 'Thursday'],
    ['Viernes', 'Friday'],
    ['Sábado', 'Saturday'],
    ['Sabados', 'Saturday'],
    ['Domingo', 'Sunday'],
    ['2do y 4to miércoles', 'Wednesday'],
  ])('%j is %s', (meetingDay, day) => {
    expect(starts(meetingDay, '7:30 pm')).toEqual([`${day} 19:30`])
  })
})

describe('parseMeetingSchedule (#2243) — Spanish ordinal weeks', () => {
  it.each([
    ['2do y 4to miércoles', 'Wednesday', [2, 4]],
    ['2o y 4o Martes', 'Tuesday', [2, 4]],
    ['1er & 3er Miércoles', 'Wednesday', [1, 3]],
    ['Segundo y Cuarto Jueves de cada Mes', 'Thursday', [2, 4]],
    ['Lunes 1ro y 5to', 'Monday', [1, 5]],
  ])('%j: %s, monthly', (meetingDay, day, weeks) => {
    expect(
      parseMeetingSchedule({ meetingDay, meetingTime: '7:30 pm' })
    ).toEqual([
      {
        day,
        cadence: 'monthly',
        weeksOfMonth: weeks,
        startTime: '19:30',
      },
    ])
  })
})

describe("parseMeetingSchedule (#2243) — 'p.m.' written against the digits", () => {
  it.each([
    ['7:30p.m.', '19:30'],
    ['8p.m. - 10p.m.', '20:00'],
    ['6:45p.m. - 8:00pm', '18:45'],
    ['7:00-9:00p.m.', '19:00'],
    ['7p.m. Pacific Time', '19:00'],
    ['9:30a.m.', '09:30'],
  ])('%j starts at %s', (time, start) => {
    expect(starts('Monday', time)).toEqual([`Monday ${start}`])
  })
})

describe('parseMeetingSchedule (#2243) — HHMM with am/pm or hrs', () => {
  it.each([
    ['730 pm', '19:30'],
    ['1000 am', '10:00'],
    ['0230pm - 0430pm', '14:30'],
    ['1600 hrs - 1800 hrs', '16:00'],
    ['1830 hrs', '18:30'],
    ['1000hrs - 1200hrs', '10:00'],
    ['0615 HRS - 0755 HRS', '06:15'],
    ['1130 Hours', '11:30'],
    ['1600 Hours (GMT+6)', '16:00'],
    ['11:00 hrs', '11:00'],
  ])('%j starts at %s', (time, start) => {
    expect(starts('Monday', time)).toEqual([`Monday ${start}`])
  })

  it.each([
    ['730-930 pm', '19:30', '21:30'],
    ['1000 - 1130 am', '10:00', '11:30'],
    ['10-12 am', '10:00', '12:00'],
  ])('%j is %s–%s', (time, startTime, endTime) => {
    expect(
      parseMeetingSchedule({ meetingDay: 'Monday', meetingTime: time })
    ).toEqual([{ day: 'Monday', cadence: 'weekly', startTime, endTime }])
  })

  it.each([
    ['1:30 hours'],
    ['1.30 hrs'],
    ['2:00 hours, 7 pm'],
    ['2 Hours'],
    ['8 hrs'],
    ['1930'],
    ['2026 pm'],
  ])('%j is not a time', time => {
    expect(starts('Monday', time)).toEqual(['Monday ?'])
  })
})

describe("parseMeetingSchedule (#2243) — '~' and '--' between a range", () => {
  it.each([
    ['3:00~5:00 pm(KST)', '15:00'],
    ['2:00~5:00 PM', '14:00'],
    ['2:00 ～ 4:00 pm', '14:00'],
    ['5:45 -- 7:00 PM Mountain Time', '17:45'],
  ])('%j starts at %s', (time, start) => {
    expect(starts('Sunday', time)).toEqual([`Sunday ${start}`])
  })
})

describe('parseMeetingSchedule (#2243) — a range ending at noon or later', () => {
  it.each([
    ['11:45 - 13:00', '11:45'],
    ['11:30-13:30/19:30-21:30', '11:30'],
    ['10:00 - 12:00', '10:00'],
    ['11:30-12:30', '11:30'],
    ['9:30 - 12:00/14:00-16:30', '09:30'],
    ['11:30 - 12.30', '11:30'],
  ])('%j starts at %s', (time, start) => {
    expect(starts('Saturday', time)).toEqual([`Saturday ${start}`])
  })

  it.each([['7:30 - 9:30'], ['6:00-7:30'], ['5:30 to 7:00']])(
    'a range %j with no am/pm and no noon stays unstated',
    time => {
      expect(starts('Saturday', time)).toEqual(['Saturday ?'])
    }
  )
})

describe('parseMeetingSchedule (#2243) — German, Dutch and Italian weekdays', () => {
  it.each([
    ['Montag', 'Monday'],
    ['Mittwoch', 'Wednesday'],
    ['Dienstag', 'Tuesday'],
    ['Maandagavond (elke even week)', 'Monday'],
    ['dinsdag', 'Tuesday'],
    ['Donderdag', 'Thursday'],
    ['Giovedì', 'Thursday'],
    ['Sabato', 'Saturday'],
  ])('%j is %s', (meetingDay, day) => {
    expect(starts(meetingDay, '20:00')).toEqual([`${day} 20:00`])
  })
})

describe("parseMeetingSchedule (#2243) — '12 AM' before an afternoon end is noon", () => {
  it.each([
    ['12:00 AM ~ 13:30 PM', '12:00'],
    ['12:00 AM-1:10 PM', '12:00'],
  ])('%j starts at %s', (time, start) => {
    expect(starts('Wednesday', time)).toEqual([`Wednesday ${start}`])
  })

  // Product decision (Ron, 2026-10-23, #2246): a literal 12 AM start is
  // "time not stated", not midnight and not noon.
  it.each([['12:00 AM'], ['12 AM'], ['12:30 am'], ['12:00 AM - 7:00 PM']])(
    'a 12 AM start in %j → time not stated',
    time => {
      expect(starts('Wednesday', time)).toEqual(['Wednesday ?'])
    }
  )

  it.each([
    ['00:30', '00:30'],
    ['12:00 PM', '12:00'],
    ['12 noon', '12:00'],
  ])('%j is not a 12 AM start (%s)', (time, start) => {
    expect(starts('Wednesday', time)).toEqual([`Wednesday ${start}`])
  })
})

describe('parseMeetingSchedule (#2246) — a time per day in one time field', () => {
  it.each([
    [
      'Wednesday, Saturday',
      'Sat 9:15am - 11:45 | Wed 7pm - 9pm',
      ['Wednesday 19:00', 'Saturday 09:15'],
    ],
    [
      'Friday, Saturday',
      '6:30 pm(Sat), 7:00 pm(Fri)',
      ['Friday 19:00', 'Saturday 18:30'],
    ],
    [
      'Tuesday and Saturday',
      'Tues 18:15 and Sat 08:30',
      ['Tuesday 18:15', 'Saturday 08:30'],
    ],
    [
      'Tuesday, Thursday',
      'Thursday 7:00 pm - 9:00 pm (Tuesday: 12:00 PM)',
      ['Tuesday 12:00', 'Thursday 19:00'],
    ],
    [
      'Monday, Saturday',
      '6:30 pm (Mon), 10 am (Sat)',
      ['Monday 18:30', 'Saturday 10:00'],
    ],
    [
      'Mardi et jeudi',
      'mardi 19h00 et jeudi 12h15',
      ['Tuesday 19:00', 'Thursday 12:15'],
    ],
    ['Saturday', 'Tues 18:15 and Sat 08:30', ['Saturday 08:30']],
  ])('%j / %j → each day gets its own time', (day, time, expected) => {
    expect(starts(day, time)).toEqual(expected)
  })

  it('keeps the end time with its own day', () => {
    expect(
      parseMeetingSchedule({
        meetingDay: 'Wednesday, Saturday',
        meetingTime: 'Sat 9:15am - 11:45 | Wed 7pm - 9pm',
      })
    ).toEqual([
      {
        day: 'Wednesday',
        cadence: 'weekly',
        startTime: '19:00',
        endTime: '21:00',
      },
      {
        day: 'Saturday',
        cadence: 'weekly',
        startTime: '09:15',
        endTime: '11:45',
      },
    ])
  })

  it.each([
    [
      'Monday, Wednesday',
      'Mon & Wed 7 pm',
      ['Monday 19:00', 'Wednesday 19:00'],
    ],
    ['Monday, Friday', 'Mon-Fri 12-1pm', ['Monday 12:00', 'Friday 12:00']],
    [
      'Saturday, Sunday',
      '10 am (Sat & Sun)',
      ['Saturday 10:00', 'Sunday 10:00'],
    ],
  ])('days named together share one time: %j / %j', (day, time, expected) => {
    expect(starts(day, time)).toEqual(expected)
  })

  it.each([
    // A time before the days and another after: which day owns which?
    ['Saturday, Sunday', '7:00 pm; Sat & Sun 10am'],
    ['Tuesday, Wednesday', '7 pm Tue, Wed 8 pm'],
    // One day named with two different times.
    ['Tuesday, Saturday', 'Tue 7 pm, Sat 9 am, Tue 6 pm'],
  ])('an ambiguous pairing %j / %j → time not stated, no guess', (d, t) => {
    expect(starts(d, t).every(s => s.endsWith(' ?'))).toBe(true)
  })

  it('a day the time field does not name gets no guessed time', () => {
    expect(starts('Monday, Wednesday', 'Mon 7pm | Sat 9am')).toEqual([
      'Monday 19:00',
      'Wednesday ?',
    ])
  })

  it.each([
    ['Tuesday', 'Tues 18:15 and Sat 08:30', ['Tuesday 18:15']],
    ['Tuesday', '7:00 pm (2nd and 4th Tuesday)', ['Tuesday 19:00']],
    ['Tuesday, Thursday', '7 pm and 8 pm', ['Tuesday 19:00', 'Thursday 20:00']],
    ['Tuesday, Thursday', '7 pm', ['Tuesday 19:00', 'Thursday 19:00']],
  ])(
    'one day word or none in the time: %j / %j unchanged',
    (d, t, expected) => {
      expect(starts(d, t)).toEqual(expected)
    }
  )
})

describe('parseMeetingSchedule (#2246) — a bare range after a mode or zone word', () => {
  it.each([
    ['Zoom 7-9 pm', '19:00'],
    ['Online 7-9 pm', '19:00'],
    ['Hybrid: 7-9 pm', '19:00'],
    ['In person 7-9 pm', '19:00'],
    ['EST 7-9 pm', '19:00'],
    ['CST 6-8 pm', '18:00'],
    ['Time: 7-9 pm', '19:00'],
    ['Meets 7-9 pm', '19:00'],
    ['Tuesday evenings 7-9 pm', '19:00'],
  ])('%j starts at %s', (time, start) => {
    expect(starts('Tuesday', time)).toEqual([`Tuesday ${start}`])
  })

  it.each([
    ['Zoom 2 - 7:30 pm', '19:30'],
    ['Online 3 - 7 pm', '19:00'],
  ])(
    'a label-like number after a mode word in %j is still not a start',
    (t, s) => {
      expect(starts('Tuesday', t)).toEqual([`Tuesday ${s}`])
    }
  )
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
