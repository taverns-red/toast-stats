/**
 * MembershipPaymentsChart Success Plan target line (#2297). The page passes
 * the target (R3); the chart draws it and names it — in the legend and in
 * the chart's accessible description — as the link's target, not TI's.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MembershipPaymentsChart } from '../MembershipPaymentsChart'
import type { PaymentTrendDataPoint } from '../../utils/paymentTrend'
import type { PaymentStatistics } from '../../hooks/usePaymentsTrend'

const trend: PaymentTrendDataPoint[] = [
  { date: '2026-07-01', payments: 1000, programYearDay: 0 },
  { date: '2026-08-01', payments: 1500, programYearDay: 31 },
]

const statistics: PaymentStatistics = {
  currentPayments: 1500,
  paymentBase: 4000,
  yearOverYearChange: null,
  trendDirection: null,
  yearOverYearUnavailableReason: null,
}

afterEach(() => cleanup())

describe('MembershipPaymentsChart plan target (#2297)', () => {
  it('shows no plan legend without a target', () => {
    render(
      <MembershipPaymentsChart paymentsTrend={trend} statistics={statistics} />
    )
    expect(screen.queryByTestId('payments-plan-legend')).not.toBeInTheDocument()
  })

  it('names the plan target in the legend and the chart description', () => {
    render(
      <MembershipPaymentsChart
        paymentsTrend={trend}
        statistics={statistics}
        planTarget={4500}
      />
    )
    const legend = screen.getByTestId('payments-plan-legend')
    expect(legend).toHaveTextContent('Plan target 4,500')
    expect(legend).toHaveTextContent('from this link')
    expect(
      screen.getByRole('img', { name: /Plan target: 4,500 payments/ })
    ).toBeInTheDocument()
  })
})
