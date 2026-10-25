/**
 * Action List: clubs short of officer training (#2296) — a section only
 * while a round is open on the page's own date, for the page's own program
 * year (R3, never the clock), listing how many more officers each club
 * needs. A June date shows the old program year's final counts while the
 * new year's Round 1 is open, so no to-do list is built from it.
 */
import { describe, it, expect } from 'vitest'
import {
  buildActionList,
  describeActionSections,
  orderActionSections,
} from '../actionListData'
import type { TrainingClub } from '../officerTraining'

const club = (
  clubId: string,
  divisionId: string,
  areaId: string,
  round1: number,
  round2: number,
  clubStatus = 'Active'
): TrainingClub => ({
  clubId,
  clubName: `Club ${clubId}`,
  divisionId,
  areaId,
  round1,
  round2,
  clubStatus,
})

const trainingClubs = [
  club('1', 'A', '01', 4, 3),
  club('2', 'A', '02', 7, 0),
  club('3', 'B', '10', 2, 6),
  club('4', 'B', '10', 5, 7),
]

const build = (
  snapshotDate: string,
  programYear: string,
  extra: Partial<Parameters<typeof buildActionList>[0]> = {},
  scope = {}
) =>
  buildActionList(
    {
      clubs: [],
      interventionClubs: [],
      divisions: [],
      snapshotDate,
      programYear,
      trainingClubs,
      ...extra,
    },
    scope
  )

describe('buildActionList — officer training (#2296)', () => {
  it('while Round 2 is open: clubs short of 4, fewest needed first', () => {
    const sections = build('2026-11-15', '2026-2027')
    expect(sections.trainingRound).toMatchObject({
      programYear: '2026-2027',
      round: 2,
    })
    expect(sections.trainingDaysLeft).toBe(106)
    expect(
      sections.trainingShort.map(c => [c.clubId, c.trained, c.needed])
    ).toEqual([
      ['1', 3, 1],
      ['2', 0, 4],
    ])
  })

  it('uses the page threshold (7 = all seven officers)', () => {
    const sections = build('2026-11-15', '2026-2027', { trainingThreshold: 7 })
    expect(sections.trainingShort.map(c => [c.clubId, c.needed])).toEqual([
      ['3', 1],
      ['1', 4],
      ['2', 7],
    ])
  })

  it('leaves suspended and ineligible clubs out of the list and counts them (review S3)', () => {
    const sections = build('2026-11-15', '2026-2027', {
      trainingClubs: [
        ...trainingClubs,
        club('5', 'A', '01', 0, 0, 'Ineligible'),
        club('6', 'A', '01', 0, 1, 'Suspended'),
      ],
    })
    expect(sections.trainingShort.map(c => c.clubId)).toEqual(['1', '2'])
    expect(sections.trainingShortIneligibleCount).toBe(2)
  })

  it('respects the division/area scope', () => {
    const sections = build('2026-11-15', '2026-2027', {}, { division: 'B' })
    expect(sections.trainingShort).toEqual([])
    const a = build('2026-11-15', '2026-2027', {}, { area: '02' })
    expect(a.trainingShort.map(c => c.clubId)).toEqual(['2'])
  })

  it('Aug 31 is still Round 1; Sep 1 has no round open', () => {
    expect(build('2026-08-31', '2026-2027').trainingRound).toMatchObject({
      round: 1,
    })
    const closed = build('2026-09-01', '2026-2027')
    expect(closed.trainingRound).toBeNull()
    expect(closed.trainingShort).toEqual([])
  })

  it('Oct 31 has no round open; Nov 1 opens Round 2', () => {
    expect(build('2026-10-31', '2026-2027').trainingRound).toBeNull()
    expect(build('2026-11-01', '2026-2027').trainingRound).toMatchObject({
      round: 2,
    })
  })

  it('Feb 29 (leap year) is still open; Mar 1 is not', () => {
    expect(build('2028-02-29', '2027-2028').trainingRound).toMatchObject({
      round: 2,
    })
    expect(build('2028-03-01', '2027-2028').trainingRound).toBeNull()
  })

  it('a June snapshot (old program year) builds no list for the new Round 1', () => {
    const june = build('2026-06-15', '2025-2026')
    expect(june.trainingRound).toBeNull()
    expect(june.trainingShort).toEqual([])
  })

  it('no officer-training data: no section', () => {
    const sections = build('2026-11-15', '2026-2027', { trainingClubs: null })
    expect(sections.trainingRound).toBeNull()
  })
})

describe('orderActionSections — officer training (#2296)', () => {
  const round = {
    programYear: '2026-2027',
    round: 2 as const,
    start: '2026-11-01',
    end: '2027-02-28',
  }

  it('is present only while a round is open, after a still-actionable plan', () => {
    expect(
      orderActionSections({
        cspTracked: true,
        cspActionable: true,
        trainingRound: round,
      })
    ).toEqual([
      'action-csp',
      'action-training',
      'action-close',
      'action-visits',
      'action-intervention',
    ])
    expect(
      orderActionSections({
        cspTracked: true,
        cspActionable: false,
        trainingRound: round,
      })
    ).toEqual([
      'action-training',
      'action-close',
      'action-visits',
      'action-intervention',
      'action-csp',
    ])
    expect(
      orderActionSections({
        cspTracked: true,
        cspActionable: false,
        trainingRound: null,
      })
    ).not.toContain('action-training')
  })

  it('names the section in the intro sentence', () => {
    expect(describeActionSections(['action-training', 'action-close'])).toBe(
      'clubs short of officer training this round, and clubs within reach of Distinguished'
    )
  })
})
