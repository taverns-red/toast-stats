/**
 * #3111 — ReinstateWindow: the five renewal periods a suspended or closed
 * club can reinstate in. Period 1 is Suspended, 2 to 5 Closed. The club's
 * period says "Now" in text (never colour alone), the end marker names the
 * last chance, and screen readers get one sentence. A row with no
 * `inactivePeriod` (placed from lastSeen alone) shows nothing.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReinstatableClub } from '@taverns-red/shared-contracts'
import {
  ClubReinstateWindow,
  ReinstateWindow,
  ReinstateWindowExample,
} from '../ReinstateWindow'

afterEach(() => cleanup())

const items = () => within(screen.getByRole('list')).getAllByRole('listitem')

describe('ReinstateWindow', () => {
  it('lists five periods with their ranges, Suspended then Closed', () => {
    render(<ReinstateWindow lastChanceBy="2027-03-31" inactivePeriod={5} />)
    const li = items()
    expect(li).toHaveLength(5)
    expect(li[0]).toHaveTextContent('Period 1')
    expect(li[0]).toHaveTextContent('Oct 2024 – Mar 2025')
    expect(li[0]).toHaveTextContent('Suspended')
    for (const i of [1, 2, 3, 4]) {
      expect(li[i]).toHaveTextContent(`Period ${i + 1}`)
      expect(li[i]).toHaveTextContent('Closed')
    }
    expect(li[4]).toHaveTextContent('Oct 2026 – Mar 2027')
  })

  it('marks only the current period "Now", in text and aria-current', () => {
    render(<ReinstateWindow lastChanceBy="2029-03-31" inactivePeriod={1} />)
    const li = items()
    expect(li[0]).toHaveTextContent('Now')
    expect(li[0]).toHaveAttribute('aria-current', 'step')
    for (const other of li.slice(1)) {
      expect(other).not.toHaveTextContent('Now')
      expect(other).not.toHaveAttribute('aria-current')
    }
  })

  it('shows the last-chance end marker', () => {
    render(<ReinstateWindow lastChanceBy="2027-03-31" inactivePeriod={5} />)
    expect(screen.getByTestId('reinstate-window-end')).toHaveTextContent(
      'Last chance: March 31, 2027'
    )
  })

  it('gives screen readers one sentence', () => {
    render(<ReinstateWindow lastChanceBy="2027-03-31" inactivePeriod={5} />)
    expect(
      screen.getByText('Period 5 of 5, last chance March 31, 2027.')
    ).toHaveClass('sr-only')
  })

  it('renders nothing for a last chance that is not a period end', () => {
    const { container } = render(
      <ReinstateWindow lastChanceBy="2027-03-30" inactivePeriod={5} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ReinstateWindowExample (Growth page, no club)', () => {
  it('explains the idea with no "Now" marker', () => {
    render(<ReinstateWindowExample />)
    expect(items()).toHaveLength(5)
    expect(screen.queryByText('Now')).toBeNull()
    expect(screen.getByTestId('reinstate-window-end')).toHaveTextContent(
      'Last chance: March 31, 2027'
    )
  })
})

describe('ClubReinstateWindow (club page)', () => {
  const row = (over: Partial<ReinstatableClub>): ReinstatableClub => ({
    clubNumber: '1314924',
    clubName: 'Period Club',
    status: 'closed',
    lastSeen: '2025-03-31',
    addsToBase: false,
    reason: 'closed_does_not_add',
    ...over,
  })

  it('draws the window for a row with a period', () => {
    render(
      <ClubReinstateWindow
        club={row({ inactivePeriod: 5, lastChanceBy: '2027-03-31' })}
      />
    )
    expect(
      screen.getByRole('region', { name: 'Time left to reinstate' })
    ).toBeInTheDocument()
    expect(items()[4]).toHaveTextContent('Now')
  })

  it('shows no period UI at all without inactivePeriod', () => {
    const { container } = render(<ClubReinstateWindow club={row({})} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows nothing when the club is not in the list', () => {
    const { container } = render(<ClubReinstateWindow club={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})
