/* A tied year in the multi-year table (#3145): every district has the same
   value, so the cell says "Tied" instead of rank 1. */

import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import MultiYearComparisonTable from '../MultiYearComparisonTable'
import type { YearlyRankingSummary } from '../../hooks/useGlobalRankings'

const tiedYear: YearlyRankingSummary = {
  programYear: '2024-2025',
  overallRank: 1,
  clubsRank: 1,
  paymentsRank: 1,
  distinguishedRank: 1,
  totalDistricts: 94,
  isPartialYear: false,
  yearOverYearChange: null,
  overallTied: true,
  clubsTied: true,
  paymentsTied: true,
  distinguishedTied: true,
}

describe('MultiYearComparisonTable tied years (#3145)', () => {
  afterEach(() => cleanup())

  it('shows "Tied" with no rank for a year every district is tied in', () => {
    render(
      <MultiYearComparisonTable yearlyRankings={[tiedYear]} isLoading={false} />
    )

    // Four cells in the desktop table and four on the phone card.
    expect(screen.getAllByText('Tied')).toHaveLength(8)
    expect(screen.queryByText('/94')).not.toBeInTheDocument()
  })

  it('keeps the rank in a category that is not tied', () => {
    const partlyTied: YearlyRankingSummary = {
      ...tiedYear,
      overallRank: 5,
      distinguishedRank: 40,
      overallTied: false,
      distinguishedTied: false,
    }
    render(
      <MultiYearComparisonTable
        yearlyRankings={[partlyTied]}
        isLoading={false}
      />
    )

    expect(screen.getAllByText('Tied')).toHaveLength(4)
    expect(screen.getAllByText('40')).toHaveLength(2)
  })
})
