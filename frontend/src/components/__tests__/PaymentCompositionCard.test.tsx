import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PaymentCompositionCard } from '../PaymentCompositionCard'

describe('PaymentCompositionCard (#327)', () => {
  it('should render all 5 payment categories', () => {
    render(
      <PaymentCompositionCard
        newPayments={1052}
        aprilPayments={2310}
        octoberPayments={2073}
        latePayments={11}
        charterPayments={41}
        totalPayments={5487}
      />
    )

    expect(screen.getByText(/New/)).toBeInTheDocument()
    expect(screen.getByText(/April/)).toBeInTheDocument()
    expect(screen.getByText(/October/)).toBeInTheDocument()
    expect(screen.getByText(/Late/)).toBeInTheDocument()
    expect(screen.getByText(/Charter/)).toBeInTheDocument()
  })

  it('should show percentage for each category', () => {
    render(
      <PaymentCompositionCard
        newPayments={500}
        aprilPayments={250}
        octoberPayments={250}
        latePayments={0}
        charterPayments={0}
        totalPayments={1000}
      />
    )

    // New = 50%, April = 25%, October = 25%
    expect(screen.getByText(/50\.0%/)).toBeInTheDocument()
  })

  it('should not render when all payments are 0', () => {
    const { container } = render(
      <PaymentCompositionCard
        newPayments={0}
        aprilPayments={0}
        octoberPayments={0}
        latePayments={0}
        charterPayments={0}
        totalPayments={0}
      />
    )
    expect(container.querySelector('.payment-composition')).toBeNull()
  })

  it('should render nothing when totalPayments is undefined', () => {
    const { container } = render(
      <PaymentCompositionCard totalPayments={undefined} />
    )
    expect(container.querySelector('.payment-composition')).toBeNull()
  })
})
