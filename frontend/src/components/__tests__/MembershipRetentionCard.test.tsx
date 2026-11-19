/* President's Membership Retention Award card on /awards (#1614).
   A Toast Stats estimate: April renewals out of October + late renewals +
   new and charter members as of March 31. Top 3 districts win. */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MembershipRetentionCard } from '../MembershipRetentionCard'
import type {
  MembershipRetentionAward,
  MembershipRetentionStanding,
} from '../../services/cdn'

const standing = (
  districtId: string,
  rank: number,
  retained: number,
  base: number,
  isWinner: boolean
): MembershipRetentionStanding => ({
  districtId,
  districtName: districtId,
  region: '7',
  rank,
  value: (retained / base) * 100,
  isWinner,
  retained,
  base,
})

const STANDINGS: MembershipRetentionStanding[] = [
  standing('64', 1, 727, 869, true),
  standing('76', 2, 2827, 3386, true),
  standing('24', 3, 612, 740, true),
  standing('61', 4, 2000, 2548, false),
  standing('F', 5, 300, 420, false),
]

const renderCard = (award: MembershipRetentionAward) =>
  render(
    <MemoryRouter>
      <MembershipRetentionCard award={award} />
    </MemoryRouter>
  )

const card = () =>
  screen.getByRole('region', {
    name: /President.s Membership Retention Award/,
  })

describe('MembershipRetentionCard — always', () => {
  it('is a titled section with a text "Toast Stats estimate" tag and the explainer', () => {
    renderCard({ status: 'final', standings: STANDINGS })
    const c = card()
    expect(
      within(c).getByRole('heading', {
        level: 2,
        name: /President.s Membership Retention Award/,
      })
    ).toBeInTheDocument()
    expect(within(c).getByText('Toast Stats estimate')).toBeInTheDocument()
    expect(c.textContent).toMatch(
      /renewed in April, out of those who renewed in October or joined before April/
    )
    expect(c.textContent).toMatch(/top 3 districts win/i)
  })

  it('links a footnote to the Methodology section and says it is not TI’s result', () => {
    renderCard({ status: 'not-started', standings: [] })
    const c = card()
    expect(c.textContent).toMatch(/not Toastmasters International.s result/)
    const link = within(c).getByRole('link', { name: /how we work it out/i })
    expect(link.getAttribute('href')).toBe(
      '/methodology#membership-retention-award'
    )
  })
})

describe('MembershipRetentionCard — final', () => {
  it('shows each district as "83.7% (727 of 869)" with thousands separators', () => {
    renderCard({
      status: 'final',
      baselineDate: '2026-03-31',
      standings: STANDINGS,
    })
    const rows = within(card()).getAllByRole('listitem')
    expect(rows).toHaveLength(5)
    expect(rows[0].textContent).toMatch(/#1/)
    expect(rows[0].textContent).toMatch(/D64/)
    expect(rows[0].textContent).toMatch(/83\.7% \(727 of 869\)/)
    expect(rows[1].textContent).toMatch(/83\.5% \(2,827 of 3,386\)/)
  })

  it('marks the top 3 as winners in text, not colour alone', () => {
    renderCard({ status: 'final', standings: STANDINGS })
    const c = card()
    expect(within(c).getByText(/✓ 3 achieved/)).toBeInTheDocument()
    const rows = within(c).getAllByRole('listitem')
    for (const row of rows.slice(0, 3)) {
      expect(within(row).getByText('winner')).toBeInTheDocument()
    }
    for (const row of rows.slice(3)) {
      expect(within(row).queryByText('winner')).toBeNull()
    }
  })

  it('says the standings are final at June 30', () => {
    renderCard({ status: 'final', standings: STANDINGS })
    expect(card().textContent).toMatch(/Final standings at June 30/)
  })

  it('renders District F like any district, linked to its page', () => {
    renderCard({ status: 'final', standings: STANDINGS })
    const link = within(card()).getByRole('link', { name: /District F/ })
    expect(link.getAttribute('href')).toBe('/district/F')
  })

  it('shows at most 10 districts', () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      standing(String(i + 1), i + 1, 500 - i, 1000, i < 3)
    )
    renderCard({ status: 'final', standings: many })
    expect(within(card()).getAllByRole('listitem')).toHaveLength(10)
  })
})

describe('MembershipRetentionCard — ties (#1610)', () => {
  // Two districts share rank 3, so four districts win.
  const TIED: MembershipRetentionStanding[] = [
    standing('64', 1, 727, 869, true),
    standing('76', 2, 2827, 3386, true),
    standing('24', 3, 600, 750, true),
    standing('61', 3, 1200, 1500, true),
    standing('F', 5, 300, 420, false),
  ]

  it('marks each tied winner with a "tied" chip and says the tie-break is unpublished', () => {
    renderCard({ status: 'final', standings: TIED })
    const c = card()
    expect(within(c).getByText(/✓ 4 achieved/)).toBeInTheDocument()
    expect(c.textContent).toMatch(
      /2 districts tied — TI.s tie-break isn.t published, so they share a rank\./
    )
    const rows = within(c).getAllByRole('listitem')
    expect(within(rows[2]).getByText('tied')).toBeInTheDocument()
    expect(within(rows[3]).getByText('tied')).toBeInTheDocument()
    for (const row of [rows[0], rows[1], rows[4]]) {
      expect(within(row).queryByText('tied')).toBeNull()
    }
  })

  it('shows no tie note when no winners share a rank', () => {
    renderCard({ status: 'final', standings: STANDINGS })
    expect(card().textContent).not.toMatch(/tie-break/)
  })
})

describe('MembershipRetentionCard — in progress', () => {
  it('labels the standings as so far, with no "achieved" claim', () => {
    renderCard({ status: 'in-progress', standings: STANDINGS })
    const c = card()
    expect(c.textContent).toMatch(/Standings so far/)
    expect(c.textContent).toMatch(/final on June 30/i)
    expect(within(c).queryByText(/achieved/)).toBeNull()
    const rows = within(c).getAllByRole('listitem')
    expect(within(rows[0]).getByText('top 3 so far')).toBeInTheDocument()
    expect(within(rows[3]).queryByText('top 3 so far')).toBeNull()
  })
})

describe('MembershipRetentionCard — no standings', () => {
  it('before April says when the standings start, with no list', () => {
    renderCard({ status: 'not-started', standings: [] })
    const c = card()
    expect(c.textContent).toMatch(
      /These standings start in April, when April renewals open\./
    )
    expect(within(c).queryByRole('list')).toBeNull()
  })

  it('baseline-missing says the estimate is not available, never zeros', () => {
    renderCard({
      status: 'baseline-missing',
      baselineDate: '2026-03-31',
      standings: [],
    })
    const c = card()
    expect(c.textContent).toMatch(/isn.t available for this date/)
    expect(within(c).queryByRole('list')).toBeNull()
    expect(c.textContent).not.toMatch(/0\.0%/)
  })

  it('treats an unknown status from a future file as not available', () => {
    renderCard({
      status: 'something-new' as never,
      standings: STANDINGS,
    })
    const c = card()
    expect(c.textContent).toMatch(/isn.t available for this date/)
    expect(within(c).queryByRole('list')).toBeNull()
  })

  it('treats in-progress with missing standings as not available', () => {
    renderCard({
      status: 'in-progress',
      standings: undefined as never,
    })
    const c = card()
    expect(c.textContent).toMatch(/isn.t available for this date/)
    expect(within(c).queryByRole('list')).toBeNull()
  })
})
