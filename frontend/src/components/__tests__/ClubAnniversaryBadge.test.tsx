import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ClubAnniversaryBadge } from '../ClubAnniversaryBadge'
import type { ClubAnniversary } from '../../utils/clubAnniversary'

/* Sprint B RED tests for #445. */

afterEach(() => cleanup())

const anniversary = (overrides: Partial<ClubAnniversary>): ClubAnniversary => ({
  years: 3,
  isMilestone: false,
  daysUntilNext: 200,
  daysSincePrev: 165,
  isUpcoming: false,
  upcomingYears: 4,
  ...overrides,
})

describe('ClubAnniversaryBadge (#445)', () => {
  it('renders nothing when anniversary is null (missing charter date)', () => {
    const { container } = render(<ClubAnniversaryBadge anniversary={null} />)
    expect(container.firstChild).toBeNull()
  })

  // #2171 (Ron, 2026-10-19): outside the ±30-day window the hero shows no
  // anniversary chip at all — the steady-state "<N> years" pill and the
  // milestone medal are retired.
  it('renders nothing outside the 30-day window', () => {
    const { container } = render(
      <ClubAnniversaryBadge
        anniversary={anniversary({ years: 7 })}
        charterDateLabel="March 1987"
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for a milestone year outside the window', () => {
    const { container } = render(
      <ClubAnniversaryBadge
        anniversary={anniversary({ years: 25, isMilestone: true })}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('uses the past tense just after the anniversary (#2171)', () => {
    render(
      <ClubAnniversaryBadge
        anniversary={anniversary({
          years: 25,
          upcomingYears: 26,
          daysUntilNext: 340,
          daysSincePrev: 1,
          isUpcoming: true,
        })}
      />
    )
    expect(screen.getByText(/25th anniversary 1 day ago/i)).toBeInTheDocument()
  })

  it('shows upcoming countdown when isUpcoming is true and not yet on the day', () => {
    render(
      <ClubAnniversaryBadge
        anniversary={anniversary({
          years: 24,
          upcomingYears: 25,
          daysUntilNext: 20,
          isUpcoming: true,
        })}
      />
    )
    expect(screen.getByText(/25th anniversary in 20 days/i)).toBeInTheDocument()
  })

  it('shows "today!" copy on the exact anniversary day', () => {
    render(
      <ClubAnniversaryBadge
        anniversary={anniversary({
          years: 25,
          upcomingYears: 25,
          daysUntilNext: 0,
          isUpcoming: true,
          isMilestone: true,
        })}
      />
    )
    expect(screen.getByText(/today/i)).toBeInTheDocument()
  })

  it('shows charter date in tooltip when charterDateLabel is provided', () => {
    render(
      <ClubAnniversaryBadge
        anniversary={anniversary({
          years: 38,
          upcomingYears: 39,
          daysUntilNext: 10,
          isUpcoming: true,
        })}
        charterDateLabel="March 1, 1987"
      />
    )
    // The label appears in the title attribute of the root element OR
    // as visible text; either works for now.
    expect(
      screen.getByText(/March 1, 1987/i, { exact: false })
    ).toBeInTheDocument()
  })
})
