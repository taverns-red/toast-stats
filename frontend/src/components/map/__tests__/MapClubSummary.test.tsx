/**
 * The selected-pin summary (#1784): name, where it sits, its status in the
 * active mode's words and a link to the club page. Never contact details,
 * meeting links or passcodes; "Contact on toastmasters.org" instead.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import type { ClubTrend } from '../../../hooks/useDistrictAnalytics'
import { MapClubSummary } from '../MapClubSummary'

const club = (o: Partial<ClubTrend>): ClubTrend =>
  ({
    clubId: '1234',
    clubName: 'Limestone City Club',
    divisionId: 'A',
    divisionName: 'Division A',
    areaId: '01',
    areaName: 'Area 01',
    membershipTrend: [],
    dcpGoalsTrend: [],
    currentStatus: 'intervention-required',
    riskFactors: [],
    distinguishedLevel: 'NotDistinguished',
    email: 'club@example.org',
    phone: '555-0100',
    website: 'https://zoom.us/j/123?pwd=secret',
    ...o,
  }) as ClubTrend

describe('MapClubSummary', () => {
  it('shows name, place, health and tier, and links to the club page', () => {
    render(
      <MemoryRouter>
        <MapClubSummary clubs={[club({})]} districtId="61" />
      </MemoryRouter>
    )
    expect(
      screen.getByRole('heading', { name: 'Limestone City Club' })
    ).toBeVisible()
    expect(screen.getByText('Division A · Area 01')).toBeVisible()
    expect(screen.getByText('Intervention required')).toBeVisible()
    expect(screen.getByText('Not yet Distinguished')).toBeVisible()
    expect(
      screen.getByRole('link', { name: /Open club page/ })
    ).toHaveAttribute('href', '/district/61/club/1234')
    expect(
      screen.getByRole('link', { name: /Contact on toastmasters.org/ })
    ).toHaveAttribute(
      'href',
      'https://www.toastmasters.org/Find-a-Club/00001234'
    )
    const text = document.body.textContent ?? ''
    expect(text).not.toContain('club@example.org')
    expect(text).not.toContain('555-0100')
    expect(text).not.toContain('pwd=secret')
  })

  it('lists every club at one location (co-located clubs)', () => {
    render(
      <MemoryRouter>
        <MapClubSummary
          clubs={[
            club({ clubId: '1', clubName: 'First Club' }),
            club({ clubId: '2', clubName: 'Second Club' }),
          ]}
          districtId="61"
        />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: 'First Club' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Second Club' })).toBeVisible()
    expect(
      screen.getAllByRole('link', { name: /Open club page/ })
    ).toHaveLength(2)
  })
})
