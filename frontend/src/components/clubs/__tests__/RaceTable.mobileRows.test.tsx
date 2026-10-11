/**
 * RaceTable on phones (#1833): below 768 px the 7-column card-table (race
 * page ~16,400 px at 375) becomes MobileRowList compact rows — rank + club on
 * line 1; district, reach window and goals on line 2; TI's rosette as the chip
 * when official. The whole row links to the club page. 50 rows, then "Show 25
 * more" — but a `?highlight=` deep link must stay reachable, so the list
 * reveals far enough to render the highlighted row (with its scroll-target id
 * and aria-current).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import type { GlobalClubRaceReached } from '@taverns-red/shared-contracts'
import { RaceTable } from '../RaceTable'

const row = (clubId: string, rank: number): GlobalClubRaceReached => ({
  clubId,
  clubName: `Club ${clubId}`,
  districtId: '61',
  current: {
    level: 'Select',
    activeMembersLevel: 'Select',
    goalsMet: 7,
    members: 22,
    membershipBase: 20,
    netGrowth: 2,
    aprilRenewals: 22,
    cspSubmitted: true,
    dcpGoalsAchieved: null,
    divisionId: 'A',
    areaId: '01',
    country: 'Canada',
  },
  tiers: {
    Distinguished: {
      reachedOn: '2026-08-12',
      observedAfter: '2026-08-11',
      rank,
    },
  },
  official: null,
})

const ROWS = Array.from({ length: 80 }, (_, i) => row(`c${i + 1}`, i + 1))

function stubMobile(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
}

const renderTable = (rows: GlobalClubRaceReached[], highlight?: string) =>
  render(
    <MemoryRouter>
      <RaceTable tier="Distinguished" rows={rows} highlightClubId={highlight} />
    </MemoryRouter>
  )

beforeEach(() => stubMobile(true))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('RaceTable < 768 px (#1833)', () => {
  it('renders ranked compact rows linking to the club page, no table', () => {
    renderTable(ROWS.slice(0, 3))
    expect(screen.queryByRole('table')).toBeNull()
    const rows = screen.getAllByTestId('mobile-row')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveAttribute('href', '/district/61/club/c1')
    expect(rows[0]!.querySelector('.mobile-row__title')).toHaveTextContent(
      '1. Club c1'
    )
    expect(rows[0]).toHaveTextContent('D61')
    expect(rows[0]).toHaveTextContent('7/10 goals')
  })

  it('caps at 50 rows with "Show 25 more"', () => {
    renderTable(ROWS)
    expect(screen.getAllByTestId('mobile-row')).toHaveLength(50)
    expect(
      screen.getByRole('button', { name: /show 25 more clubs/i })
    ).toBeInTheDocument()
  })

  it('reveals a ?highlight= row past the cap, with its scroll id and aria-current', () => {
    renderTable(ROWS, 'c70')
    const target = document.getElementById('race-row-c70')
    expect(target).not.toBeNull()
    expect(target).toHaveAttribute('aria-current', 'true')
    expect(target).toHaveAttribute('href', '/district/61/club/c70')
  })

  it('keeps the table at ≥ 768 px', () => {
    stubMobile(false)
    renderTable(ROWS.slice(0, 3))
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.queryAllByTestId('mobile-row')).toHaveLength(0)
  })
})
