/**
 * D3 type floor, rendered (#2725): table headers are sentence case at 14px and
 * data cells are not set smaller. jsdom has no cascade, so this checks the
 * classes that carry the size and the case.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { DCPProjectionsTable } from '../DCPProjectionsTable'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'

const club: ClubTrend = {
  clubId: '1',
  clubName: 'Club 1',
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: 'A1',
  areaName: 'Area A1',
  membershipTrend: [{ date: '2025-01-01', count: 20 }],
  dcpGoalsTrend: [{ date: '2025-01-01', goalsAchieved: 4 }],
  currentStatus: 'thriving',
  riskFactors: [],
  distinguishedLevel: 'NotDistinguished',
  octoberRenewals: 0,
  newMembers: 0,
  clubStatus: 'Active',
}

describe('DCPProjectionsTable type floor (#2725)', () => {
  it('headers are 14px and not uppercased', () => {
    render(<DCPProjectionsTable clubs={[club]} />)
    const headers = screen.getAllByRole('columnheader')
    expect(headers.length).toBeGreaterThan(3)
    for (const th of headers) {
      expect(th.className).toContain('text-sm')
      expect(th.className).not.toMatch(/\buppercase\b|\btext-xs\b/)
    }
  })

  it('no rendered element uses a sub-12px text class', () => {
    const { container } = render(<DCPProjectionsTable clubs={[club]} />)
    expect(container.innerHTML).not.toMatch(/text-\[(?:9|10|11)px\]/)
  })
})
