/**
 * MyDistrictCard (#2249) — under the hero search, the starred district as
 * one tappable card: chip + name, rank, and movement since the last visit.
 * Nothing new is stored: it reads the my-district star (#417) and the
 * last-visit diff (#418) the page already keeps.
 */
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MyDistrictCard, MyDistrictCardReserve } from '../MyDistrictCard'

const renderCard = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>)

describe('MyDistrictCard (#2249)', () => {
  it('is one link to the district, naming it, its rank and the field size', () => {
    renderCard(
      <MyDistrictCard
        districtId="61"
        districtName="District 61"
        rank={11}
        total={94}
        rankDelta={null}
        previousDate={null}
      />
    )
    const link = screen.getByRole('link', { name: /your district/i })
    expect(link).toHaveAttribute('href', '/district/61')
    expect(link).toHaveTextContent('D61')
    expect(link).toHaveTextContent(/rank #11 of 94/i)
    expect(link).not.toHaveTextContent(/since/i)
  })

  it('says how far it moved since the last visit, with the date', () => {
    renderCard(
      <MyDistrictCard
        districtId="61"
        districtName="District 61"
        rank={11}
        total={94}
        rankDelta={2}
        previousDate="2026-10-15"
      />
    )
    expect(screen.getByRole('link')).toHaveTextContent(
      /up 2 places since 2026-10-15/i
    )
  })

  it('reads "down" for a negative move and singular for one place', () => {
    renderCard(
      <MyDistrictCard
        districtId="61"
        districtName="District 61"
        rank={12}
        total={94}
        rankDelta={-1}
        previousDate="2026-10-15"
      />
    )
    expect(screen.getByRole('link')).toHaveTextContent(
      /down 1 place since 2026-10-15/i
    )
  })

  it('reads "no change" for a zero move', () => {
    renderCard(
      <MyDistrictCard
        districtId="61"
        districtName="District 61"
        rank={11}
        total={94}
        rankDelta={0}
        previousDate="2026-10-15"
      />
    )
    expect(screen.getByRole('link')).toHaveTextContent(/no change since/i)
  })

  it('says nothing about movement when the last visit is this same data date (review S10)', () => {
    renderCard(
      <MyDistrictCard
        districtId="61"
        districtName="District 61"
        rank={11}
        total={94}
        rankDelta={0}
        previousDate="2026-10-22"
        asOfDate="2026-10-22"
      />
    )
    expect(screen.getByRole('link')).not.toHaveTextContent(/since/i)
  })

  it("still links to a starred district missing from this year's rankings, so the reserve never collapses (review S10)", () => {
    renderCard(
      <MyDistrictCard
        districtId="U"
        districtName=""
        rank={null}
        total={94}
        rankDelta={null}
        previousDate={null}
      />
    )
    const link = screen.getByRole('link', { name: /your district/i })
    expect(link).toHaveAttribute('href', '/district/U')
    expect(link).toHaveTextContent(/not in this year's rankings/i)
    expect(link).not.toHaveTextContent(/rank #/i)
  })

  it('has a same-class reserve for the loading shell that is not a link', () => {
    const { container } = renderCard(<MyDistrictCardReserve />)
    expect(container.querySelector('.my-district-card')).not.toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
