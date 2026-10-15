/**
 * #1805 — the hero's lineage chip sits on the area/division/district line:
 * "District 201 (District 1 until June 2026)". Omitted for a club that
 * never moved; former names shown when the history has any.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { ClubHero, type ClubHeroProps } from '../ClubHero'

afterEach(() => cleanup())

const club = {
  clubName: 'Professional Women Toastmasters',
  areaName: 'Area 24',
  divisionName: 'Division C',
}

function renderHero(extra: Partial<ClubHeroProps> = {}) {
  return render(
    <MemoryRouter>
      <ClubHero
        clubId="977"
        districtId="201"
        club={club}
        controls={null}
        {...extra}
      />
    </MemoryRouter>
  )
}

describe('ClubHero lineage chip (#1805)', () => {
  it('shows the former district after the current one', () => {
    renderHero({
      lineage: {
        formerDistricts: ['District 1 until June 2026'],
        formerNames: [],
      },
    })
    const sub = screen.getByText('District 201').closest('p')!
    expect(sub).toHaveTextContent('District 201 (District 1 until June 2026)')
    expect(within(sub).getByText('(District 1 until June 2026)')).toHaveClass(
      'club-hero__lineage'
    )
  })

  it('shows former names', () => {
    renderHero({
      lineage: {
        formerDistricts: ['District 10 until June 2026'],
        formerNames: ['Westlake Toastmasters Club'],
      },
    })
    expect(
      screen.getByText('Formerly Westlake Toastmasters Club')
    ).toBeInTheDocument()
  })

  it('renders no chip without a lineage', () => {
    const { container } = renderHero()
    expect(container.querySelector('.club-hero__lineage')).toBeNull()
    expect(screen.queryByText(/Formerly/)).toBeNull()
  })
})
