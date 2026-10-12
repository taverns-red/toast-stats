/**
 * ClubGridSheet (#1845, mobile epic #1827 Phase 2) — the phone's answer to the
 * grid tile's hover tooltip: tap a tile, read the club's full name, where it
 * sits, its health, its Distinguished tier and DCP, and follow one link to the
 * club page. Built on the shared BottomSheet primitive (#1831).
 *
 * Privacy: the sheet renders only whitelisted ClubTrend fields — never
 * contact details, meeting links or passcodes.
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { ClubGridSheet } from '../ClubGridSheet'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'

function club(overrides: Partial<ClubTrend> = {}): ClubTrend {
  return {
    clubId: '7238597',
    clubName: 'A Very Long Club Name Toastmasters That Truncates On Tiles',
    divisionId: 'B',
    divisionName: 'Division B',
    areaId: '12',
    areaName: 'Area 12',
    membershipTrend: [{ date: '2026-06-01', count: 18 }],
    dcpGoalsTrend: [{ date: '2026-06-01', goalsAchieved: 4 }],
    currentStatus: 'vulnerable',
    riskFactors: [],
    distinguishedLevel: 'Select',
    ...overrides,
  } as ClubTrend
}

const renderSheet = (c: ClubTrend | null, onClose = vi.fn()) => {
  render(
    <MemoryRouter>
      <ClubGridSheet club={c} districtId="61" onClose={onClose} />
    </MemoryRouter>
  )
  return onClose
}

describe('ClubGridSheet', () => {
  it('renders nothing when no club is selected', () => {
    renderSheet(null)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('titles the dialog with the full club name', () => {
    renderSheet(club())
    expect(
      screen.getByRole('dialog', {
        name: 'A Very Long Club Name Toastmasters That Truncates On Tiles',
      })
    ).toBeInTheDocument()
  })

  it('shows division · area, health, tier and DCP as text', () => {
    renderSheet(club())
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Division B · Area 12')).toBeInTheDocument()
    expect(within(dialog).getByText('Vulnerable')).toBeInTheDocument()
    expect(within(dialog).getByText('Select')).toBeInTheDocument()
    expect(within(dialog).getByText('4/10')).toBeInTheDocument()
  })

  it('shows Suspended as the status for a suspended club', () => {
    renderSheet(club({ clubStatus: 'Suspended' }))
    expect(
      within(screen.getByRole('dialog')).getByText('Suspended')
    ).toBeInTheDocument()
  })

  it('links to the club page', () => {
    renderSheet(club())
    expect(
      screen.getByRole('link', { name: /open club page/i })
    ).toHaveAttribute('href', '/district/61/club/7238597')
  })

  it('closes via the close button', () => {
    const onClose = renderSheet(club())
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('never renders contact details, meeting links or passcodes', () => {
    renderSheet(
      club({
        // Fields that must never leak even if a future feed carries them.
        ...({
          email: 'pres@example.com',
          phone: '555-0100',
          meetingLink: 'https://zoom.us/j/123',
          passcode: 'secret',
        } as Partial<ClubTrend>),
      })
    )
    const text = screen.getByRole('dialog').textContent ?? ''
    expect(text).not.toMatch(/@|555-0100|zoom|secret/i)
  })
})
