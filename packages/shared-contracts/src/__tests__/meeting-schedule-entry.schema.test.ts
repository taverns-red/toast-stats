import { describe, expect, it } from 'vitest'

import { MeetingScheduleEntrySchema } from '../index.js'

/**
 * #2627: the additive meetingSchedule[] fields (ADR 0019). Every one is
 * optional, so an entry written before them still validates.
 */
describe('MeetingScheduleEntrySchema (#2627) — additive fields', () => {
  it('still accepts an entry written before the new fields', () => {
    expect(
      MeetingScheduleEntrySchema.safeParse({
        day: 'Wednesday',
        cadence: 'monthly',
        weeksOfMonth: [1, 3],
        startTime: '19:30',
        mode: 'in-person',
      }).success
    ).toBe(true)
  })

  it('says the last week with lastWeek; weeksOfMonth stays numbers 1-5', () => {
    expect(
      MeetingScheduleEntrySchema.safeParse({
        day: 'Thursday',
        cadence: 'monthly',
        lastWeek: true,
      }).success
    ).toBe(true)
    expect(
      MeetingScheduleEntrySchema.safeParse({
        day: 'Thursday',
        cadence: 'monthly',
        weeksOfMonth: [2],
        lastWeek: true,
      }).success
    ).toBe(true)
    // A 2.90.1 reader validates weeksOfMonth as 1-5 only (ADR 0019).
    expect(
      MeetingScheduleEntrySchema.safeParse({
        day: 'Thursday',
        weeksOfMonth: ['last'],
      }).success
    ).toBe(false)
  })

  it.each([['first'], [0], [6], [-1]])(
    'rejects %j as a week of the month',
    week => {
      expect(
        MeetingScheduleEntrySchema.safeParse({
          day: 'Thursday',
          weeksOfMonth: [week],
        }).success
      ).toBe(false)
    }
  )

  it('accepts restricted and uncertain flags, and rejects non-booleans', () => {
    expect(
      MeetingScheduleEntrySchema.safeParse({
        day: 'Tuesday',
        restricted: true,
        uncertain: true,
      }).success
    ).toBe(true)
    expect(
      MeetingScheduleEntrySchema.safeParse({
        day: 'Tuesday',
        restricted: 'yes',
      }).success
    ).toBe(false)
  })

  it('stays strict about unknown keys', () => {
    expect(
      MeetingScheduleEntrySchema.safeParse({ day: 'Tuesday', guests: 'no' })
        .success
    ).toBe(false)
  })
})
