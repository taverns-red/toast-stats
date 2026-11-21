/* Tied dates on the rest of the Rankings page (#3145): the Overall card, the
   multi-year table and the change between years. A tied rank is rank 1 for
   every district, so it must not show as a rank or feed a change. Files
   written before the tie flags existed must read exactly as before. */

import { describe, it, expect } from 'vitest'
import {
  buildYearlyRankingSummaries,
  extractEndOfYearRankings,
} from '../globalRankingsUtils'
import type {
  HistoricalRankPoint,
  ProgramYearWithData,
  RankHistoryResponse,
} from '../../types/districts'

const ALL_TIED = {
  clubsTied: true,
  paymentsTied: true,
  distinguishedTied: true,
} as const

const point = (
  date: string,
  rank: number,
  extra: Partial<HistoricalRankPoint> = {}
): HistoricalRankPoint => ({
  date,
  aggregateScore: 100,
  clubsRank: rank,
  paymentsRank: rank,
  distinguishedRank: rank,
  overallRank: rank,
  totalDistricts: 94,
  ...extra,
})

const response = (points: HistoricalRankPoint[]): RankHistoryResponse => ({
  districtId: '61',
  districtName: 'District 61',
  history: points,
  programYear: {
    startDate: '2026-07-01',
    endDate: '2027-06-30',
    year: '2026-2027',
  },
})

const py = (year: string): ProgramYearWithData => {
  const start = year.slice(0, 4)
  const end = year.slice(5)
  return {
    year,
    startDate: `${start}-07-01`,
    endDate: `${end}-06-30`,
    hasCompleteData: true,
    snapshotCount: 1,
    latestSnapshotDate: `${end}-06-30`,
  }
}

const byYear = (
  entries: Array<[string, HistoricalRankPoint]>
): Map<string, RankHistoryResponse> =>
  new Map(entries.map(([year, p]) => [year, response([p])]))

describe('Overall Rank card on a tied date (#3145)', () => {
  it('is tied when every category is tied', () => {
    const r = extractEndOfYearRankings(
      response([point('2026-07-31', 1, ALL_TIED)]),
      py('2026-2027')
    )
    expect(r?.overall.tied).toBe(true)
  })

  it('is not tied when one category still separates districts', () => {
    const r = extractEndOfYearRankings(
      response([
        point('2026-07-31', 1, { paymentsTied: true, distinguishedTied: true }),
      ]),
      py('2026-2027')
    )
    expect(r?.overall.tied).toBeUndefined()
  })
})

describe('buildYearlyRankingSummaries with tied years (#3145)', () => {
  it('marks a tied year and gives it no change', () => {
    const summaries = buildYearlyRankingSummaries(
      [py('2023-2024'), py('2024-2025')],
      byYear([
        ['2023-2024', point('2024-06-30', 10)],
        ['2024-2025', point('2025-06-30', 1, ALL_TIED)],
      ])
    )
    const tied = summaries.find(s => s.programYear === '2024-2025')
    expect(tied).toMatchObject({
      overallTied: true,
      clubsTied: true,
      paymentsTied: true,
      distinguishedTied: true,
    })
    expect(tied?.yearOverYearChange).toBeNull()
  })

  it('does not count a change from a tied previous year', () => {
    const summaries = buildYearlyRankingSummaries(
      [py('2024-2025'), py('2025-2026')],
      byYear([
        ['2024-2025', point('2025-06-30', 1, ALL_TIED)],
        ['2025-2026', point('2026-06-30', 10)],
      ])
    )
    const current = summaries.find(s => s.programYear === '2025-2026')
    expect(current?.yearOverYearChange).toBeNull()
  })

  it('drops only the tied category from the change', () => {
    const summaries = buildYearlyRankingSummaries(
      [py('2024-2025'), py('2025-2026')],
      byYear([
        ['2024-2025', point('2025-06-30', 1, { distinguishedTied: true })],
        ['2025-2026', point('2026-06-30', 10)],
      ])
    )
    const current = summaries.find(s => s.programYear === '2025-2026')
    expect(current?.yearOverYearChange).toEqual({
      overall: -9,
      clubs: -9,
      payments: -9,
    })
  })

  it('reads old files without tie flags exactly as before', () => {
    const summaries = buildYearlyRankingSummaries(
      [py('2024-2025'), py('2025-2026')],
      byYear([
        ['2024-2025', point('2025-06-30', 1)],
        ['2025-2026', point('2026-06-30', 10)],
      ])
    )
    expect(summaries).toEqual([
      {
        programYear: '2025-2026',
        overallRank: 10,
        clubsRank: 10,
        paymentsRank: 10,
        distinguishedRank: 10,
        totalDistricts: 94,
        isPartialYear: false,
        yearOverYearChange: {
          overall: -9,
          clubs: -9,
          payments: -9,
          distinguished: -9,
        },
      },
      {
        programYear: '2024-2025',
        overallRank: 1,
        clubsRank: 1,
        paymentsRank: 1,
        distinguishedRank: 1,
        totalDistricts: 94,
        isPartialYear: false,
        yearOverYearChange: null,
      },
    ])
  })
})
