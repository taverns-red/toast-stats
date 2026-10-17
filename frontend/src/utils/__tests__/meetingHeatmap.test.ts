import { describe, it, expect } from 'vitest'
import type { MeetingScheduleEntry } from '@taverns-red/shared-contracts'
import fixture from '../../__tests__/fixtures/meeting-schedule-d61-2026-10-15.json'
import {
  buildMeetingHeatmap,
  clubsInSlot,
  describeMeetingEntry,
  matchesMeetingFilter,
  meetingFilterToken,
  parseMeetingMode,
  parseMeetingSlot,
  slotKey,
  type MeetingClub,
} from '../meetingHeatmap'

/* #1796 — the meeting-time heatmap's pure layer, over the real D61
   2026-10-15 meetingSchedule[] (#1789) recorded from one prod object. */

const clubs = fixture.clubs as MeetingClub[]

const club = (
  clubId: string,
  meetingSchedule?: MeetingScheduleEntry[] | null
): MeetingClub => ({
  clubId,
  clubName: `Club ${clubId}`,
  ...(meetingSchedule !== undefined ? { meetingSchedule } : {}),
})

describe('buildMeetingHeatmap — real D61 2026-10-15', () => {
  const all = buildMeetingHeatmap(clubs, 'all')

  it('is 7 days × 24 hours', () => {
    expect(all.counts).toHaveLength(7)
    for (const row of all.counts) expect(row).toHaveLength(24)
  })

  it('counts unparsed schedules as unknown, never drops them', () => {
    expect(all.totalClubs).toBe(161)
    expect(all.scheduled).toBe(158)
    expect(all.unknown.map(c => c.clubId).sort()).toEqual(
      clubs
        .filter(c => !c.meetingSchedule?.length)
        .map(c => c.clubId)
        .sort()
    )
    expect(all.unknown).toHaveLength(3)
  })

  it('a club meeting in-person and online on the same slot counts once', () => {
    // 3045: Wed 1st & 3rd in person, 2nd online, both 19:30.
    const wed19 = clubsInSlot(clubs, { day: 'Wednesday', hour: 19 }, 'all')
    expect(wed19.filter(c => c.clubId === '3045')).toHaveLength(1)
    expect(all.counts[2]![19]).toBe(wed19.length)
  })

  it('in-person = in-person or hybrid; online = online or hybrid', () => {
    const inPerson = buildMeetingHeatmap(clubs, 'in-person')
    const online = buildMeetingHeatmap(clubs, 'online')
    expect(inPerson.counts[2]![19]).toBeGreaterThan(0)
    expect(all.onlineCapable).toBe(
      clubs.filter(c =>
        c.meetingSchedule?.some(e => e.mode === 'online' || e.mode === 'hybrid')
      ).length
    )
    // Every cell in a mode is ≤ the all-modes cell.
    for (let d = 0; d < 7; d++)
      for (let h = 0; h < 24; h++) {
        expect(inPerson.counts[d]![h]!).toBeLessThanOrEqual(all.counts[d]![h]!)
        expect(online.counts[d]![h]!).toBeLessThanOrEqual(all.counts[d]![h]!)
      }
  })

  it('the cell total equals the clubs listed for it, in every mode', () => {
    for (const mode of ['all', 'in-person', 'online'] as const) {
      const map = buildMeetingHeatmap(clubs, mode)
      let sum = 0
      for (let d = 0; d < 7; d++)
        for (let h = 0; h < 24; h++) sum += map.counts[d]![h]!
      // Distinct per cell; a club meeting twice a week is in two cells.
      const listed = map.counts
        .flatMap((row, d) =>
          row.map(
            (_, h) =>
              clubsInSlot(
                clubs,
                {
                  day: (
                    [
                      'Monday',
                      'Tuesday',
                      'Wednesday',
                      'Thursday',
                      'Friday',
                      'Saturday',
                      'Sunday',
                    ] as const
                  )[d]!,
                  hour: h,
                },
                mode
              ).length
          )
        )
        .reduce((a, b) => a + b, 0)
      expect(listed).toBe(sum)
    }
  })
})

describe('buildMeetingHeatmap — edge cases', () => {
  it('a day with no time is "time not stated" for that day, not dropped', () => {
    const map = buildMeetingHeatmap(
      [club('1', [{ day: 'Tuesday', cadence: 'weekly' }])],
      'all'
    )
    expect(map.noTime[1]).toBe(1)
    expect(map.counts[1]!.every(n => n === 0)).toBe(true)
    expect(map.scheduled).toBe(1)
    expect(
      clubsInSlot(
        [club('1', [{ day: 'Tuesday' }])],
        { day: 'Tuesday', hour: null },
        'all'
      )
    ).toHaveLength(1)
  })

  it('null, absent and empty schedules are all unknown', () => {
    const map = buildMeetingHeatmap(
      [club('1', null), club('2'), club('3', [])],
      'all'
    )
    expect(map.unknown).toHaveLength(3)
    expect(map.scheduled).toBe(0)
    expect(map.max).toBe(0)
  })

  it('a schedule with no mode is "mode not stated" in a mode view', () => {
    const c = club('1', [{ day: 'Monday', startTime: '18:00' }])
    expect(buildMeetingHeatmap([c], 'all').counts[0]![18]).toBe(1)
    const online = buildMeetingHeatmap([c], 'online')
    expect(online.counts[0]![18]).toBe(0)
    expect(online.modeNotStated.map(x => x.clubId)).toEqual(['1'])
    expect(buildMeetingHeatmap([c], 'all').modeNotStated).toEqual([])
  })

  it('an online-only club is not "mode not stated" in the in-person view', () => {
    const c = club('1', [{ day: 'Monday', startTime: '18:00', mode: 'online' }])
    expect(buildMeetingHeatmap([c], 'in-person').modeNotStated).toEqual([])
  })

  it('lists evenings (17:00–21:59) where no club starts', () => {
    const map = buildMeetingHeatmap(
      [
        club('1', [{ day: 'Monday', startTime: '19:00' }]),
        club('2', [{ day: 'Tuesday', startTime: '12:00' }]),
        club('3', [{ day: 'Wednesday', startTime: '22:00' }]),
        club('4', [{ day: 'Thursday', startTime: '17:00' }]),
      ],
      'all'
    )
    expect(map.eveningGaps).toEqual([
      'Tuesday',
      'Wednesday',
      'Friday',
      'Saturday',
      'Sunday',
    ])
  })

  it('max is the busiest cell', () => {
    const map = buildMeetingHeatmap(
      [
        club('1', [{ day: 'Monday', startTime: '19:00' }]),
        club('2', [{ day: 'Monday', startTime: '19:45' }]),
        club('3', [{ day: 'Friday', startTime: '07:00' }]),
      ],
      'all'
    )
    expect(map.counts[0]![19]).toBe(2)
    expect(map.max).toBe(2)
  })
})

describe('URL state', () => {
  it('mode is whitelisted at the parse', () => {
    expect(parseMeetingMode(null)).toBe('all')
    expect(parseMeetingMode('online')).toBe('online')
    expect(parseMeetingMode('in-person')).toBe('in-person')
    expect(parseMeetingMode('zoom')).toBe('all')
  })

  it('slot keys round-trip and garbage is null', () => {
    for (const s of [
      { day: 'Tuesday', hour: 19 },
      { day: 'Sunday', hour: 0 },
      { day: 'Monday', hour: null },
    ] as const) {
      expect(parseMeetingSlot(slotKey(s))).toEqual(s)
    }
    expect(slotKey({ day: 'Tuesday', hour: 7 })).toBe('tue-07')
    expect(slotKey({ day: 'Tuesday', hour: null })).toBe('tue-notime')
    expect(parseMeetingSlot('unknown')).toBe('unknown')
    expect(parseMeetingSlot('nomode')).toBe('nomode')
    for (const bad of [null, '', 'tue', 'tue-24', 'xyz-10', 'tue-7x'])
      expect(parseMeetingSlot(bad)).toBeNull()
  })
})

describe('map filter token (the same predicate as the heatmap)', () => {
  it('encodes day, hour and mode', () => {
    expect(meetingFilterToken({ day: 'Tuesday', hour: 19 }, 'all')).toBe(
      'tue-19'
    )
    expect(meetingFilterToken({ day: 'Tuesday', hour: 19 }, 'online')).toBe(
      'tue-19-online'
    )
    expect(meetingFilterToken({ day: 'Friday', hour: 8 }, 'in-person')).toBe(
      'fri-08-inperson'
    )
  })

  it('the map matches exactly the clubs the cell lists', () => {
    for (const mode of ['all', 'in-person', 'online'] as const) {
      const slot = { day: 'Wednesday', hour: 19 } as const
      const token = meetingFilterToken(slot, mode)
      const onMap = clubs
        .filter(c => matchesMeetingFilter(c, token))
        .map(c => c.clubId)
        .sort()
      const listed = clubsInSlot(clubs, slot, mode)
        .map(c => c.clubId)
        .sort()
      expect(onMap.length).toBeGreaterThan(0)
      expect(onMap).toEqual(listed)
    }
  })

  it('a day-only token matches any time that day; garbage matches nothing', () => {
    const c = club('1', [{ day: 'Monday', startTime: '07:15' }])
    expect(matchesMeetingFilter(c, 'mon')).toBe(true)
    expect(matchesMeetingFilter(c, 'tue')).toBe(false)
    expect(matchesMeetingFilter(c, 'mon-07')).toBe(true)
    expect(matchesMeetingFilter(c, 'mon-08')).toBe(false)
    expect(matchesMeetingFilter(c, 'bogus')).toBe(false)
    expect(matchesMeetingFilter(club('2'), 'mon')).toBe(false)
  })
})

describe('describeMeetingEntry', () => {
  it('says day, time, cadence and mode from the parsed fields only', () => {
    expect(
      describeMeetingEntry({
        day: 'Wednesday',
        cadence: 'monthly',
        weeksOfMonth: [1, 3],
        startTime: '19:30',
        mode: 'in-person',
      })
    ).toBe('Wednesday 19:30 · 1st & 3rd of the month · In person')
    expect(
      describeMeetingEntry({
        day: 'Monday',
        cadence: 'weekly',
        startTime: '11:45',
        endTime: '13:00',
        mode: 'online',
      })
    ).toBe('Monday 11:45–13:00 · Weekly · Online')
    expect(describeMeetingEntry({ day: 'Friday', cadence: 'biweekly' })).toBe(
      'Friday, time not stated · Every other week'
    )
    expect(
      describeMeetingEntry({
        day: 'Sunday',
        startTime: '09:00',
        mode: 'hybrid',
      })
    ).toBe('Sunday 09:00 · Hybrid')
  })
})
