/**
 * Officer-training round windows (#2296): one dated, program-year-aware rules
 * table. Round 1 runs Jun 1 – Aug 31 (it opens a month BEFORE its program
 * year starts on Jul 1); Round 2 runs Nov 1 – the last day of February, so a
 * leap year moves its last day to Feb 29.
 */
import { describe, it, expect } from 'vitest'
import {
  OFFICER_TRAINING_ROUND_RULES,
  getOfficerTrainingRounds,
  officerTrainingRoundsOn,
  daysLeftInRound,
} from '../officerTrainingRounds.js'

describe('getOfficerTrainingRounds', () => {
  it('places Round 1 in June–August of the year the program year starts', () => {
    expect(getOfficerTrainingRounds('2026-2027')).toEqual([
      {
        programYear: '2026-2027',
        round: 1,
        start: '2026-06-01',
        end: '2026-08-31',
      },
      {
        programYear: '2026-2027',
        round: 2,
        start: '2026-11-01',
        end: '2027-02-28',
      },
    ])
  })

  it('ends Round 2 on Feb 29 in a leap year', () => {
    expect(getOfficerTrainingRounds('2027-2028')[1]!.end).toBe('2028-02-29')
  })

  it('rejects a string that is not a program year', () => {
    expect(() => getOfficerTrainingRounds('2026')).toThrow()
  })

  it('is a dated table: every rule names the first program year it applies to', () => {
    expect(OFFICER_TRAINING_ROUND_RULES.length).toBeGreaterThan(0)
    for (const rule of OFFICER_TRAINING_ROUND_RULES) {
      expect(rule.fromProgramYear).toMatch(/^\d{4}-\d{4}$/)
      expect(rule.source.length).toBeGreaterThan(0)
    }
  })
})

describe('officerTrainingRoundsOn — window boundaries', () => {
  it('May 31: no round open; Round 1 of the NEXT program year opens Jun 1', () => {
    const state = officerTrainingRoundsOn('2026-05-31')
    expect(state.open).toBeNull()
    expect(state.next).toMatchObject({
      programYear: '2026-2027',
      round: 1,
      start: '2026-06-01',
    })
    expect(state.lastClosed).toMatchObject({
      programYear: '2025-2026',
      round: 2,
      end: '2026-02-28',
    })
  })

  it('Jun 1: Round 1 of the next program year is open, 92 days left', () => {
    const state = officerTrainingRoundsOn('2026-06-01')
    expect(state.open).toMatchObject({ programYear: '2026-2027', round: 1 })
    expect(daysLeftInRound(state.open!, '2026-06-01')).toBe(92)
  })

  it('Aug 31: still open, its last day', () => {
    const state = officerTrainingRoundsOn('2026-08-31')
    expect(state.open).toMatchObject({ programYear: '2026-2027', round: 1 })
    expect(daysLeftInRound(state.open!, '2026-08-31')).toBe(1)
  })

  it('Sep 1: Round 1 closed; Round 2 opens Nov 1', () => {
    const state = officerTrainingRoundsOn('2026-09-01')
    expect(state.open).toBeNull()
    expect(state.lastClosed).toMatchObject({
      programYear: '2026-2027',
      round: 1,
    })
    expect(state.next).toMatchObject({
      programYear: '2026-2027',
      round: 2,
      start: '2026-11-01',
    })
  })

  it('Oct 31: still between rounds', () => {
    const state = officerTrainingRoundsOn('2026-10-31')
    expect(state.open).toBeNull()
    expect(state.next).toMatchObject({ round: 2, start: '2026-11-01' })
  })

  it('Nov 1: Round 2 open, to Feb 28 of the next calendar year', () => {
    const state = officerTrainingRoundsOn('2026-11-01')
    expect(state.open).toMatchObject({
      programYear: '2026-2027',
      round: 2,
      end: '2027-02-28',
    })
    expect(daysLeftInRound(state.open!, '2026-11-01')).toBe(120)
  })

  it('Feb 28 (non-leap year): Round 2 open, its last day', () => {
    const state = officerTrainingRoundsOn('2027-02-28')
    expect(state.open).toMatchObject({ programYear: '2026-2027', round: 2 })
    expect(daysLeftInRound(state.open!, '2027-02-28')).toBe(1)
  })

  it('Mar 1 (non-leap year): Round 2 closed; next is Round 1 on Jun 1', () => {
    const state = officerTrainingRoundsOn('2027-03-01')
    expect(state.open).toBeNull()
    expect(state.lastClosed).toMatchObject({
      programYear: '2026-2027',
      round: 2,
    })
    expect(state.next).toMatchObject({
      programYear: '2027-2028',
      round: 1,
      start: '2027-06-01',
    })
  })

  it('Feb 28 (leap year): Round 2 still has Feb 29 to go', () => {
    const state = officerTrainingRoundsOn('2028-02-28')
    expect(state.open).toMatchObject({ programYear: '2027-2028', round: 2 })
    expect(daysLeftInRound(state.open!, '2028-02-28')).toBe(2)
  })

  it('Feb 29 (leap year): Round 2 open, its last day', () => {
    const state = officerTrainingRoundsOn('2028-02-29')
    expect(state.open).toMatchObject({ programYear: '2027-2028', round: 2 })
    expect(daysLeftInRound(state.open!, '2028-02-29')).toBe(1)
  })

  it('Mar 1 (leap year): Round 2 closed', () => {
    const state = officerTrainingRoundsOn('2028-03-01')
    expect(state.open).toBeNull()
    expect(state.lastClosed).toMatchObject({
      programYear: '2027-2028',
      round: 2,
    })
  })

  it('rejects a date that is not YYYY-MM-DD', () => {
    expect(() => officerTrainingRoundsOn('10/25/2026')).toThrow()
  })
})
