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

  /* The 375 Overview has about 12px left under PAGE_MAX_H (4000), so phones
     get one short line; the award name and long wording are md: and up. */
  it('keeps phones to a compact line and the long wording to md: and up', () => {
    renderWith(badge())
    const el = screen.getByTestId('membership-retention-badge')
    const compact = within(el).getByTestId('membership-retention-compact')
    expect(compact).toHaveClass('md:hidden')
    expect(compact).toHaveTextContent('Retention')
    const long = within(el).getAllByTestId('membership-retention-long')
    expect(long.length).toBeGreaterThan(0)
    for (const part of long) {
      expect(part).toHaveClass('hidden')
      expect(part).toHaveClass('md:inline')
    }
    expect(long.map(p => p.textContent).join(' ')).toContain(
      "President's Membership Retention Award"
    )
    // No top border or top padding on phones: one text line only.
    expect(el).not.toHaveClass('border-t')
    expect(el).not.toHaveClass('pt-4')
    expect(el).toHaveClass('md:border-t', 'md:pt-4')
  })

  it('keeps one methodology link on phones, named in full', () => {
    renderWith(badge())
    const link = within(
      screen.getByTestId('membership-retention-badge')
    ).getByRole('link', {
      name: "How we estimate the President's Membership Retention Award",
    })
    expect(link).toHaveTextContent('estimate')
  })

  it('gives screen readers the tie-break note, not only a title', () => {
    renderWith(badge({ rank: 3, isWinner: true, final: true, tied: true }))
    const el = screen.getByTestId('membership-retention-badge')
    const note = within(el).getByText(/tie-break isn't published/, {
      selector: '.sr-only',
    })
    expect(note).toBeInTheDocument()
    expect(within(el).getByTitle("TI's tie-break isn't published")).toBe(
      within(el).getByText('tied')
    )
  })

  it('leaves out "of N" when the count is unknown', () => {
    renderWith(badge({ rank: 7, of: null }))
    const el = screen.getByTestId('membership-retention-badge')
    expect(el).toHaveTextContent('#7')
    expect(el).not.toHaveTextContent(/#7\s+of/)
  })

  it('renders nothing without a badge', () => {
    renderWith(null)
    expect(
      screen.queryByTestId('membership-retention-badge')
    ).not.toBeInTheDocument()
  })
})
