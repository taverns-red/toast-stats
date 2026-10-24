/**
 * The selected-pin summary (#1784): name, where it sits, its status in the
 * active mode's words and a link to the club page. Never contact details,
 * meeting links or passcodes; "Contact on toastmasters.org" instead.
 */
import { describe, expect, it, vi } from 'vitest'
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

  it('names and links each club’s own district on a region map (#1808)', () => {
    render(
      <MemoryRouter>
        <MapClubSummary
          clubs={[club({})]}
          districtId="61"
          districtOf={() => '49'}
        />
      </MemoryRouter>
    )
    expect(screen.getByText('District 49 · Division A · Area 01')).toBeVisible()
    expect(
      screen.getByRole('link', { name: /Open club page/ })
    ).toHaveAttribute('href', '/district/49/club/1234')
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

  it('shows members · goals and the meeting line (#1788), never a meeting link', () => {
    render(
      <MemoryRouter>
        <MapClubSummary
          clubs={[
            club({
              membershipTrend: [
                { date: '2026-10-01', count: 10 },
                { date: '2026-10-11', count: 14 },
              ],
              dcpGoalsTrend: [{ date: '2026-10-11', goalsAchieved: 3 }],
              meetingDay: 'Tuesdays',
              meetingTime: '7:00 PM Meeting ID 812 Passcode 999',
              allowsVirtualAttendance: true,
              address: { street: 'https://us02web.zoom.us/j/812' },
            }),
          ]}
          districtId="61"
        />
      </MemoryRouter>
    )
    expect(screen.getByText('14 members · 3 goals')).toBeVisible()
    // The time carries meeting credentials: since #2157 the shared place
    // scrub removes them and keeps the time. A street that is a meeting
    // link means the club meets online.
    expect(screen.getByText('Tuesdays · 7:00 PM · Meets online')).toBeVisible()
    const text = document.body.textContent ?? ''
    expect(text).not.toContain('zoom.us')
    expect(text).not.toContain('Passcode')
    expect(text).not.toContain('Meeting ID')
    expect(text).not.toMatch(/\b(?:812|999)\b/)
  })

  it('says the meeting time is not readable instead of TI\'s "?" text (#2247)', () => {
    render(
      <MemoryRouter>
        <MapClubSummary
          clubs={[
            club({
              website: undefined,
              meetingDay: '???',
              meetingTime: '??2:30-??4:30',
              allowsVirtualAttendance: false,
            }),
          ]}
          districtId="88"
        />
      </MemoryRouter>
    )
    expect(
      screen.getByText(
        'Meeting time not readable — see toastmasters.org · In person'
      )
    ).toBeVisible()
    expect(document.body.textContent).not.toContain('??')
  })

  it('omits the meeting line without Find-a-Club data, and the counts without a trend', () => {
    render(
      <MemoryRouter>
        <MapClubSummary
          clubs={[club({ website: undefined })]}
          districtId="61"
        />
      </MemoryRouter>
    )
    expect(screen.queryByText(/members/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Meets|In person|Online/)).not.toBeInTheDocument()
  })

  it('autoFocus moves focus to the first club heading, once (#1967)', () => {
    const onAutoFocused = vi.fn()
    render(
      <MemoryRouter>
        <MapClubSummary
          clubs={[club({}), club({ clubId: '5678', clubName: 'Second Club' })]}
          districtId="61"
          autoFocus
          onAutoFocused={onAutoFocused}
        />
      </MemoryRouter>
    )
    const heading = screen.getByRole('heading', {
      name: 'Limestone City Club',
    })
    expect(heading).toHaveFocus()
    expect(heading).toHaveAttribute('tabindex', '-1')
    expect(onAutoFocused).toHaveBeenCalledTimes(1)
  })

  it('leaves focus alone without autoFocus (a pointer tap)', () => {
    render(
      <MemoryRouter>
        <MapClubSummary clubs={[club({})]} districtId="61" />
      </MemoryRouter>
    )
    expect(document.body).toHaveFocus()
  })
})
