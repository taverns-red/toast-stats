import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { NextDeadlineStrip } from '../NextDeadlineStrip'

/* #2298 — the next-deadline strip: the next two dates of the page's program
   year from the one cited deadline table, counted down from the page's own
   date (R3), and a plain "all passed" line once the year has none left. */

afterEach(cleanup)

const strip = () => screen.getByTestId('next-deadline-strip')

describe('NextDeadlineStrip (#2298)', () => {
  it('shows the next two deadlines with a countdown', () => {
    render(<NextDeadlineStrip programYear="2026-2027" asOfDate="2026-10-26" />)
    const items = within(strip()).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Round 2 officer training opens')
    expect(items[0]).toHaveTextContent('Nov 1')
    expect(items[0]).toHaveTextContent('in 6 days')
    expect(items[1]).toHaveTextContent('Round 1 club visit reports due')
    expect(items[1]).toHaveTextContent('Nov 30')
    expect(items[1]).toHaveTextContent('in 35 days')
  })

  it('says today and tomorrow rather than 0 or 1 days', () => {
    render(<NextDeadlineStrip programYear="2026-2027" asOfDate="2026-11-30" />)
    const items = within(strip()).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('today')
    cleanup()
    render(<NextDeadlineStrip programYear="2026-2027" asOfDate="2026-10-31" />)
    expect(within(strip()).getAllByRole('listitem')[0]).toHaveTextContent(
      'tomorrow'
    )
  })

  it('says when every deadline of the year has passed', () => {
    render(<NextDeadlineStrip programYear="2026-2027" asOfDate="2027-06-10" />)
    expect(within(strip()).queryAllByRole('listitem')).toHaveLength(0)
    expect(strip()).toHaveTextContent('Every 2026–27 deadline has passed.')
  })

  it('cites each deadline’s TI source in its title', () => {
    render(<NextDeadlineStrip programYear="2026-2027" asOfDate="2026-11-15" />)
    const [first] = within(strip()).getAllByRole('listitem')
    expect(first).toHaveAttribute('title', expect.stringContaining('Item 1490'))
  })

  it('reserves its slot while the page date is still loading', () => {
    render(<NextDeadlineStrip programYear="2026-2027" asOfDate={undefined} />)
    expect(strip()).toHaveAttribute('aria-busy', 'true')
    expect(within(strip()).queryAllByRole('listitem')).toHaveLength(0)
  })
})
