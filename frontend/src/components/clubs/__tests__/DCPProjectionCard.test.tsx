/**
 * #2639 (UNIT-39): the "Gap to Each Tier" list must not offer a tier that did
 * not exist in the selected program year. `calculateClubProjection` reports a
 * missing Smedley rung as an already-closed gap ({0,0}), and the card used to
 * read that as "Smedley ✓ Met" for a Not Distinguished club in 2019-20.
 *
 * A suspended club is not eligible for recognition, so its card says that
 * instead of listing gaps it cannot close.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { DCPProjectionCard } from '../DCPProjectionCard'
import { calculateClubProjection } from '../../../utils/dcpProjections'
import type { ClubTrend } from '../../../hooks/useDistrictAnalytics'

afterEach(() => cleanup())

const CLUB: ClubTrend = {
  clubId: 'c1',
  clubName: 'Limestone City Club',
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: '01',
  areaName: 'Area 01',
  distinguishedLevel: 'NotDistinguished',
  currentStatus: 'vulnerable',
  riskFactors: [],
  membershipTrend: [{ date: '2025-07-15', count: 18 }],
  dcpGoalsTrend: [{ date: '2025-07-15', goalsAchieved: 3 }],
}

function renderCard(
  programYear: string,
  extra: { suspended?: boolean } = {}
): void {
  render(
    <DCPProjectionCard
      projection={calculateClubProjection(CLUB, programYear)}
      healthStatus="vulnerable"
      programYear={programYear}
      {...extra}
    />
  )
}

describe('DCPProjectionCard tiers (#2639)', () => {
  it('omits the Smedley row in a program year without that rung', () => {
    renderCard('2019-2020')
    const section = screen.getByText('Gap to Each Tier').closest('.gap-section')
    const inSection = within(section as HTMLElement)
    expect(inSection.getByText('Distinguished')).toBeInTheDocument()
    expect(inSection.queryByText('Smedley')).toBeNull()
  })

  it('lists Smedley in a program year that had the rung', () => {
    renderCard('2025-2026')
    const section = screen.getByText('Gap to Each Tier').closest('.gap-section')
    expect(within(section as HTMLElement).getByText('Smedley')).toBeVisible()
  })

  it('says a suspended club is not eligible, instead of listing gaps', () => {
    renderCard('2025-2026', { suspended: true })
    expect(
      screen.getByText("Suspended clubs aren't eligible for recognition")
    ).toBeInTheDocument()
    expect(screen.queryByText('Gap to Each Tier')).toBeNull()
  })
})
