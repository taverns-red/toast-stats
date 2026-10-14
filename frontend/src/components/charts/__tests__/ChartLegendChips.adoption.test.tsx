/**
 * The multi-series charts use the chip legend, not Recharts' strip (#1835).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MembershipTrendChart } from '../../MembershipTrendChart'
import { MembershipPaymentsChart } from '../../MembershipPaymentsChart'
import HistoricalRankChart from '../../HistoricalRankChart'
import type { RankHistoryResponse } from '../../../types/districts'

afterEach(cleanup)

const rank = (id: string, name: string): RankHistoryResponse => ({
  districtId: id,
  districtName: name,
  history: [
    {
      date: '2026-08-15',
      aggregateScore: 150,
      clubsRank: 15,
      paymentsRank: 20,
      distinguishedRank: 10,
      totalDistricts: 120,
      overallRank: 50,
    },
    {
      date: '2026-09-15',
      aggregateScore: 140,
      clubsRank: 12,
      paymentsRank: 18,
      distinguishedRank: 8,
      totalDistricts: 120,
      overallRank: 40,
    },
  ],
  programYear: {
    startDate: '2026-07-01',
    endDate: '2027-06-30',
    year: '2026-2027',
  },
})

const chipNames = () =>
  Array.from(
    screen
      .getByRole('group', { name: 'Chart series' })
      .querySelectorAll('button')
  ).map(b => b.textContent)

describe('chip legend adoption (#1835)', () => {
  it('HistoricalRankChart: one chip per district, by name', () => {
    render(
      <HistoricalRankChart
        data={[rank('61', 'District 61'), rank('42', 'District 42')]}
        isLoading={false}
        isError={false}
      />
    )
    expect(chipNames()).toEqual(['District 61', 'District 42'])
    const chip = screen.getByRole('button', { name: 'District 42' })
    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  it('MembershipPaymentsChart: one chip per program year', () => {
    const pts = (base: number) => [
      { date: '2026-08-01', payments: base, programYearDay: 31 },
      { date: '2026-09-01', payments: base + 500, programYearDay: 62 },
    ]
    render(
      <MembershipPaymentsChart
        paymentsTrend={pts(1000)}
        multiYearData={{
          currentYear: { label: '2026-2027', data: pts(1000) },
          previousYears: [{ label: '2025-2026', data: pts(900) }],
        }}
        statistics={{
          currentPayments: 1500,
          paymentBase: 1400,
          yearOverYearChange: 100,
          trendDirection: 'up',
          yearOverYearUnavailableReason: null,
        }}
      />
    )
    expect(chipNames()).toHaveLength(2)
  })

  it('MembershipTrendChart: the current year and each prior year', () => {
    render(
      <MembershipTrendChart
        programYear="2026-2027"
        membershipTrend={[
          { date: '2026-08-01', count: 3000 },
          { date: '2026-09-01', count: 3100 },
        ]}
        priorYearTrends={[
          {
            label: '2025-2026',
            data: [
              { date: '2025-08-01', count: 2900 },
              { date: '2025-09-01', count: 2950 },
            ],
          },
        ]}
      />
    )
    expect(chipNames()).toHaveLength(2)
  })
})
