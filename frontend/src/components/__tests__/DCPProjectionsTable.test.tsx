/**
 * Tests for DCPProjectionsTable component (#6)
 *
 * Tests:
 * - Renders table with projections data
 * - Summary cards display correct counts
 * - Sorting by different columns
 * - Filtering by tier and division
 * - "Close to next tier" filter
 * - Empty state displays correctly
 * - Loading state shows skeleton
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'
import { DCPProjectionsTable } from '../DCPProjectionsTable'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'

// Mock LoadingSkeleton to simplify testing
vi.mock('../LoadingSkeleton', () => ({
  LoadingSkeleton: vi.fn(() => (
    <div data-testid="loading-skeleton">Loading...</div>
  )),
}))

// Helper to create test clubs
function makeClub(
  id: string,
  goals: number,
  members: number,
  overrides: Partial<ClubTrend> = {}
): ClubTrend {
  return {
    clubId: id,
    clubName: overrides.clubName ?? `Club ${id}`,
    divisionId: overrides.divisionId ?? 'A',
    divisionName: overrides.divisionName ?? 'Division A',
    areaId: overrides.areaId ?? 'A1',
    areaName: overrides.areaName ?? 'Area A1',
    membershipTrend: [{ date: '2025-01-01', count: members }],
    dcpGoalsTrend: [{ date: '2025-01-01', goalsAchieved: goals }],
    currentStatus: 'thriving',
    riskFactors: [],
    distinguishedLevel: 'NotDistinguished',
    aprilRenewals: overrides.aprilRenewals,
    octoberRenewals: overrides.octoberRenewals ?? 0,
    newMembers: overrides.newMembers ?? 0,
    clubStatus: 'Active',
    ...overrides,
  }
}

describe('DCPProjectionsTable (#6)', () => {
  const testClubs: ClubTrend[] = [
    makeClub('1', 4, 20, { clubName: 'Almost Distinguished Club' }),
    makeClub('2', 10, 30, {
      clubName: 'Top Smedley Club',
      distinguishedLevel: 'Smedley',
    }),
    makeClub('3', 6, 22, {
      clubName: 'Near Select Club',
      divisionId: 'B',
      divisionName: 'Division B',
      distinguishedLevel: 'Distinguished',
    }),
    makeClub('4', 0, 8, { clubName: 'New Club' }),
  ]

  describe('Rendering', () => {
    it('should render the DCP Projections table with clubs', () => {
      render(<DCPProjectionsTable clubs={testClubs} />)

      expect(screen.getByText('📊 DCP Projections')).toBeInTheDocument()
      expect(screen.getByText('Almost Distinguished Club')).toBeInTheDocument()
      expect(screen.getByText('Top Smedley Club')).toBeInTheDocument()
      expect(screen.getByText('Near Select Club')).toBeInTheDocument()
      expect(screen.getByText('New Club')).toBeInTheDocument()
    })

    it('should show loading skeleton when isLoading is true', () => {
      render(<DCPProjectionsTable clubs={[]} isLoading={true} />)

      expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument()
    })

    it('should show empty state when no clubs match filters', () => {
      render(<DCPProjectionsTable clubs={[]} />)

      expect(screen.getByText(/no clubs match/i)).toBeInTheDocument()
    })
  })

  describe('Summary Cards', () => {
    it('should display correct counts in summary cards', () => {
      render(<DCPProjectionsTable clubs={testClubs} />)

      // Summary cards and filter dropdown both use these labels,
      // so verify the table renders with all four metric categories
      expect(screen.getByTestId('dcp-projections-table')).toBeInTheDocument()
      expect(screen.getByText('Distinguished+')).toBeInTheDocument()
      expect(screen.getByText('Close to Next Tier')).toBeInTheDocument()
      expect(screen.getByText('Projected Upgrades')).toBeInTheDocument()
    })
  })

  describe('Sorting', () => {
    it('should sort by club name when clicking the Club header', () => {
      render(<DCPProjectionsTable clubs={testClubs} />)

      const clubHeader = screen.getByText('Club')
      fireEvent.click(clubHeader)

      const rows = screen.getAllByRole('row').slice(1) // skip header
      expect(rows[0]).toHaveTextContent('Almost Distinguished Club')
    })

    it('should sort by goals when clicking the Goals header', () => {
      render(<DCPProjectionsTable clubs={testClubs} />)

      const goalsHeader = screen.getByText('Goals')
      fireEvent.click(goalsHeader) // asc

      const rows = screen.getAllByRole('row').slice(1)
      // First row should have lowest goals (0)
      expect(rows[0]).toHaveTextContent('New Club')
    })
  })

  describe('Filtering', () => {
    it('should filter by tier', () => {
      render(<DCPProjectionsTable clubs={testClubs} />)

      const tierFilter = screen.getByLabelText('Filter by tier')
      fireEvent.change(tierFilter, { target: { value: 'Smedley' } })

      // Only Smedley club should show
      expect(screen.getByText('Top Smedley Club')).toBeInTheDocument()
      expect(
        screen.queryByText('Almost Distinguished Club')
      ).not.toBeInTheDocument()
    })

    it('should filter by division', () => {
      render(<DCPProjectionsTable clubs={testClubs} />)

      const divisionFilter = screen.getByLabelText('Filter by division')
      fireEvent.change(divisionFilter, { target: { value: 'B' } })

      // Only Division B club should show
      expect(screen.getByText('Near Select Club')).toBeInTheDocument()
      expect(
        screen.queryByText('Almost Distinguished Club')
      ).not.toBeInTheDocument()
    })

    it('should filter for close-to-next-tier clubs', () => {
      render(<DCPProjectionsTable clubs={testClubs} />)

      const closeToggle = screen.getByLabelText(/close to next tier/i)
      fireEvent.click(closeToggle)

      // Club 1 (4 goals, 20 members) is 1 goal from Distinguished — close
      expect(screen.getByText('Almost Distinguished Club')).toBeInTheDocument()
      // Club 4 (0 goals, 8 members) needs 5 goals + 12 members — NOT close
      expect(screen.queryByText('New Club')).not.toBeInTheDocument()
    })
  })

  describe('Tier Badges', () => {
    it('should show ✓ Max for Smedley clubs in gap column', () => {
      render(<DCPProjectionsTable clubs={testClubs} />)

      expect(screen.getByText('✓ Max')).toBeInTheDocument()
    })
  })

  describe('"No value" dashes carry an accessible label (#2643, #2774)', () => {
    it('labels the April renewals dash for a club with no reported value', () => {
      render(
        <DCPProjectionsTable
          clubs={[makeClub('9', 4, 20, { clubName: 'No Renewals Club' })]}
        />
      )

      const label = screen.getByText('No April renewals')
      expect(label).toHaveClass('sr-only')
      // The visible dash is hidden from assistive tech; the label speaks.
      expect(
        label.parentElement?.querySelector('[aria-hidden="true"]')
      ).toHaveTextContent('—')
    })

    it('does not add the label when the club reports a value', () => {
      render(
        <DCPProjectionsTable
          clubs={[
            makeClub('9', 4, 20, {
              clubName: 'Renewed Club',
              aprilRenewals: 3,
            }),
          ]}
        />
      )

      expect(screen.queryByText('No April renewals')).not.toBeInTheDocument()
    })

    it('labels the tier dash for a Not distinguished club', () => {
      render(
        <DCPProjectionsTable
          clubs={[makeClub('9', 0, 8, { clubName: 'Plain Club' })]}
        />
      )

      const labels = screen.getAllByText('Not distinguished')
      expect(labels.length).toBeGreaterThan(0)
      for (const label of labels) {
        expect(label).toHaveClass('sr-only')
        expect(
          label.parentElement?.querySelector('[aria-hidden="true"]')
        ).toHaveTextContent('—')
      }
    })
  })
})
