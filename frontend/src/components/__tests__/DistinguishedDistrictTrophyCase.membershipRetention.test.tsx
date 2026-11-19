/**
 * The trophy case's President's Membership Retention Award badge (#1614).
 * It is our estimate, so it always says so and links to Methodology. It says
 * "winner" only on the June 30 close; before that a top-3 district is
 * "top 3 so far".
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

import {
  DistinguishedDistrictTrophyCase,
  type DistinguishedDistrictStatus,
} from '../DistinguishedDistrictTrophyCase'
import type { MembershipRetentionBadge } from '../../utils/membershipRetentionBadge'

afterEach(() => cleanup())

const PY = '2025-2026'

const status: DistinguishedDistrictStatus = {
  districtId: '61',
  currentTier: 'Distinguished',
  allPrerequisitesMet: true,
  prerequisites: {
    dspSubmitted: true,
    trainingMet: true,
    marketAnalysisSubmitted: true,
    communicationPlanSubmitted: true,
    regionAdvisorVisitMet: true,
  },
  nextTierGap: null,
}

const badge = (
  overrides: Partial<MembershipRetentionBadge> = {}
): MembershipRetentionBadge => ({
  rank: 13,
  of: 126,
  value: 78.5,
  isWinner: false,
  final: false,
  tied: false,
  ...overrides,
})

const renderWith = (membershipRetention: MembershipRetentionBadge | null) =>
  render(
    <DistinguishedDistrictTrophyCase
      status={status}
      programYear={PY}
      membershipRetention={membershipRetention}
    />
  )

describe('membership retention badge (#1614)', () => {
  it('shows the rank so far, the award name and the value', () => {
    renderWith(badge())
    const el = screen.getByTestId('membership-retention-badge')
    expect(el).toHaveTextContent('#13 of 126 so far')
    expect(el).toHaveTextContent("President's Membership Retention Award")
    expect(el).toHaveTextContent('78.5%')
  })

  it('labels it as our estimate and links to Methodology', () => {
    renderWith(badge())
    const el = screen.getByTestId('membership-retention-badge')
    expect(el).toHaveTextContent('Toast Stats estimate')
    const link = within(el).getByRole('link')
    expect(link).toHaveAttribute(
      'href',
      '/methodology#membership-retention-award'
    )
  })

  it('says "top 3 so far", never "winner", while in progress', () => {
    renderWith(badge({ rank: 2, isWinner: true }))
    const el = screen.getByTestId('membership-retention-badge')
    expect(el).toHaveTextContent('top 3 so far')
    expect(el).not.toHaveTextContent(/winner|achieved/i)
  })

  it('says "winner" for a top-3 district on the final close', () => {
    renderWith(badge({ rank: 2, isWinner: true, final: true }))
    const el = screen.getByTestId('membership-retention-badge')
    expect(el).toHaveTextContent('#2 of 126')
    expect(el).toHaveTextContent('winner')
    expect(el).not.toHaveTextContent('so far')
  })

  it('gives a final rank without "so far" or "winner" outside the top 3', () => {
    renderWith(badge({ final: true }))
    const el = screen.getByTestId('membership-retention-badge')
    expect(el).toHaveTextContent('#13 of 126')
    expect(el).not.toHaveTextContent(/so far|winner/)
  })

  it('marks a tied winner (#1610)', () => {
    renderWith(badge({ rank: 3, isWinner: true, final: true, tied: true }))
    expect(screen.getByTestId('membership-retention-badge')).toHaveTextContent(
      'tied'
    )
  })

  it('renders nothing without a badge', () => {
    renderWith(null)
    expect(
      screen.queryByTestId('membership-retention-badge')
    ).not.toBeInTheDocument()
  })
})
