/**
 * Tests for Provisional Distinguished Badge Rendering (#291)
 *
 * Red phase: these tests define the expected behavior for
 * provisional Distinguished indicators across components.
 *
 * Expected behavior:
 * - ClubDetailModal: badge shows "Level*" with explanatory text below
 * - ClubsTable: badge shows "Level*" with tooltip
 * - ClubDetailPage: badge shows "Level*" with explanatory text
 */

import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClubDetailModal } from '../ClubDetailModal'
import { ClubTrend } from '../../hooks/useDistrictAnalytics'

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

const createMockClub = (overrides: Partial<ClubTrend> = {}): ClubTrend => ({
  clubId: 'club-1',
  clubName: 'Test Club',
  divisionId: 'div-1',
  divisionName: 'Division A',
  areaId: 'area-1',
  areaName: 'Area 1',
  distinguishedLevel: 'Distinguished',
  currentStatus: 'thriving',
  riskFactors: [],
  membershipTrend: [{ date: '2026-03-15', count: 22 }],
  dcpGoalsTrend: [{ date: '2026-03-15', goalsAchieved: 6 }],
  membershipBase: 15,
  aprilRenewals: 5,
  newMembers: 3,
  ...overrides,
})

describe('Provisional Distinguished Badge — ClubDetailModal', () => {
  afterEach(cleanup)

  // @ts-expect-error -- Red phase: test defines expected behavior before implementation
  it.fails('shows asterisk on Distinguished badge when provisional', () => {
    const club = createMockClub({
      distinguishedLevel: 'Select',
      aprilRenewals: 5,
      membershipBase: 15,
      membershipTrend: [{ date: '2026-03-15', count: 22 }],
    })

    renderWithQueryClient(
      <ClubDetailModal club={club} onClose={() => {}} districtId="61" />
    )

    // Badge should show "Select*" not just "Select"
    expect(screen.getByText(/Select\*/)).toBeInTheDocument()
  })

  // @ts-expect-error -- Red phase: test defines expected behavior before implementation
  it.fails('shows provisional explanation text below badge', () => {
    const club = createMockClub({
      distinguishedLevel: 'Distinguished',
      aprilRenewals: 3,
      membershipBase: 15,
      membershipTrend: [{ date: '2026-03-15', count: 20 }],
    })

    renderWithQueryClient(
      <ClubDetailModal club={club} onClose={() => {}} districtId="61" />
    )

    expect(screen.getByText(/provisional/i)).toBeInTheDocument()
  })

  it('does NOT show asterisk when Distinguished is confirmed', () => {
    const club = createMockClub({
      distinguishedLevel: 'Select',
      aprilRenewals: 22,
      membershipBase: 15,
      membershipTrend: [{ date: '2026-03-15', count: 22 }],
    })

    renderWithQueryClient(
      <ClubDetailModal club={club} onClose={() => {}} districtId="61" />
    )

    // Should show "Select" without asterisk
    const badge = screen.getByText('Select')
    expect(badge).toBeInTheDocument()
    expect(screen.queryByText(/Select\*/)).not.toBeInTheDocument()
  })

  it('does NOT show asterisk for post-April data', () => {
    const club = createMockClub({
      distinguishedLevel: 'Distinguished',
      aprilRenewals: 0,
      membershipBase: 15,
      membershipTrend: [{ date: '2026-05-15', count: 20 }],
    })

    renderWithQueryClient(
      <ClubDetailModal club={club} onClose={() => {}} districtId="61" />
    )

    const badge = screen.getByText('Distinguished')
    expect(badge).toBeInTheDocument()
    expect(screen.queryByText(/Distinguished\*/)).not.toBeInTheDocument()
  })
})
