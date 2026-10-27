/* Region District Recognition scoreboard (#2307): per tier, how many of the
   region's districts meet it at this snapshot (the PY-gated
   `currentTier` from competitive-awards.json) and how far the nearest
   district below it still has to go. */

import { describe, it, expect } from 'vitest'
import { buildRecognitionScoreboard } from '../regionRecognition'
import type {
  DistinguishedDistrictStatus,
  DistinguishedDistrictTier,
} from '../../services/cdn'

const district = (
  districtId: string,
  over: Partial<{
    paidClubBase: number
    paymentBase: number
    paidClubs: number
    totalPayments: number
    distinguishedClubs: number
  }> = {}
) => ({
  districtId,
  paidClubBase: 100,
  paymentBase: 1000,
  paidClubs: 100,
  totalPayments: 1000,
  distinguishedClubs: 0,
  ...over,
})

const status = (
  districtId: string,
  currentTier: DistinguishedDistrictTier
): DistinguishedDistrictStatus => ({
  districtId,
  currentTier,
  allPrerequisitesMet: true,
  prerequisites: {
    dspSubmitted: true,
    trainingMet: true,
    marketAnalysisSubmitted: true,
    communicationPlanSubmitted: true,
    regionAdvisorVisitMet: true,
  },
  nextTierGap: null,
})

describe('buildRecognitionScoreboard (#2307)', () => {
  it('counts districts at each tier or higher, lowest tier first', () => {
    const board = buildRecognitionScoreboard(
      [district('1'), district('2'), district('3'), district('4')],
      {
        '1': status('1', 'Select'),
        '2': status('2', 'Distinguished'),
        '3': status('3', 'NotDistinguished'),
        '4': status('4', 'Smedley'),
      },
      '2026-2027'
    )!
    expect(board.districts).toBe(4)
    expect(board.rows.map(r => [r.tier, r.meeting])).toEqual([
      ['Distinguished', 3],
      ['Select', 2],
      ['Presidents', 1],
      ['Smedley', 1],
    ])
  })

  it('names the nearest district below each tier with its counts to go', () => {
    const board = buildRecognitionScoreboard(
      [
        // 45 distinguished clubs short (45% of 100) — far.
        district('61', { paidClubs: 101, totalPayments: 1010 }),
        // Only 5 distinguished clubs short — nearest.
        district('86', {
          paidClubs: 101,
          totalPayments: 1010,
          distinguishedClubs: 40,
        }),
      ],
      {
        '61': status('61', 'NotDistinguished'),
        '86': status('86', 'NotDistinguished'),
      },
      '2026-2027'
    )!
    const dist = board.rows.find(r => r.tier === 'Distinguished')!
    expect(dist.nearest).toEqual({
      districtId: '86',
      paidClubsRemaining: 0,
      paymentsRemaining: 0,
      distinguishedClubsRemaining: 5,
    })
  })

  it('has no nearest district when every district meets the tier', () => {
    const board = buildRecognitionScoreboard(
      [district('1')],
      { '1': status('1', 'Smedley') },
      '2026-2027'
    )!
    expect(board.rows.every(r => r.nearest === null)).toBe(true)
  })

  it('counts Unknown (prerequisite not reported) apart, as not meeting', () => {
    const board = buildRecognitionScoreboard(
      [district('1'), district('2')],
      { '1': status('1', 'Unknown'), '2': status('2', 'NotDistinguished') },
      '2026-2027'
    )!
    expect(board.unknown).toBe(1)
    expect(board.rows[0]!.meeting).toBe(0)
  })

  it('follows the program year ladder: no Smedley row before 2018-19', () => {
    const board = buildRecognitionScoreboard(
      [district('1')],
      { '1': status('1', 'Presidents') },
      '2017-2018'
    )!
    expect(board.rows.map(r => r.tier)).toEqual([
      'Distinguished',
      'Select',
      'Presidents',
    ])
  })

  it('leaves out districts missing from the awards file', () => {
    const board = buildRecognitionScoreboard(
      [district('1'), district('2')],
      { '1': status('1', 'Distinguished') },
      '2026-2027'
    )!
    expect(board.districts).toBe(1)
  })

  it('is null without awards or without any matching district', () => {
    expect(
      buildRecognitionScoreboard([district('1')], null, '2026-2027')
    ).toBeNull()
    expect(
      buildRecognitionScoreboard(
        [district('1')],
        { '9': status('9', 'Smedley') },
        '2026-2027'
      )
    ).toBeNull()
  })

  it("counts districts on track by last year's pace, apart from meeting", () => {
    const median = {
      clubs: 1.01,
      payments: 0.4,
      distinguished: 0.05,
      districts: 3,
    }
    const board = buildRecognitionScoreboard(
      [
        district('1', {
          paidClubs: 102,
          totalPayments: 450,
          distinguishedClubs: 6,
        }),
        district('2', {
          paidClubs: 100,
          totalPayments: 450,
          distinguishedClubs: 6,
        }),
      ],
      {
        '1': status('1', 'NotDistinguished'),
        '2': status('2', 'NotDistinguished'),
      },
      '2026-2027',
      { Distinguished: median, Select: null }
    )!
    expect(board.rows.map(r => [r.tier, r.meeting, r.onTrack])).toEqual([
      ['Distinguished', 0, 1],
      ['Select', 0, null],
      ['Presidents', 0, null],
      ['Smedley', 0, null],
    ])
  })

  it('has no on-track counts without a pace', () => {
    const board = buildRecognitionScoreboard(
      [district('1')],
      { '1': status('1', 'Select') },
      '2026-2027'
    )!
    expect(board.rows.every(r => r.onTrack === null)).toBe(true)
  })

  it('nests on track: a district counts for a tier only if on track for every lower tier', () => {
    const board = buildRecognitionScoreboard(
      [
        // Paid clubs 1.00: below the Distinguished bar (1.02) but above the
        // Select bar (0.99), which a small group can set lower.
        district('1', {
          paidClubs: 100,
          totalPayments: 600,
          distinguishedClubs: 20,
        }),
        district('2', {
          paidClubs: 103,
          totalPayments: 600,
          distinguishedClubs: 20,
        }),
      ],
      {
        '1': status('1', 'NotDistinguished'),
        '2': status('2', 'NotDistinguished'),
      },
      '2026-2027',
      {
        Distinguished: {
          clubs: 1.02,
          payments: 0.5,
          distinguished: 0.1,
          districts: 9,
        },
        Select: {
          clubs: 0.99,
          payments: 0.5,
          distinguished: 0.1,
          districts: 4,
        },
        Presidents: {
          clubs: 1.0,
          payments: 0.7,
          distinguished: 0.1,
          districts: 3,
        },
        Smedley: null,
      }
    )!
    expect(board.rows.map(r => [r.tier, r.onTrack])).toEqual([
      ['Distinguished', 1],
      ['Select', 1],
      ['Presidents', 0],
      ['Smedley', null],
    ])
  })
})
