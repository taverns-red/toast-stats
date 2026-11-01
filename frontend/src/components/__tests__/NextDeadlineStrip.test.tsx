import { describe, it, expect, afterEach } from 'vitest'
import {
  render,
  screen,
  cleanup,
  within,
  fireEvent,
} from '@testing-library/react'
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

/* #2429 — "See all deadlines": the whole year from the same cited table,
   grouped by month, with an owner role only where a TI source names it (and
   the citation), plus the .ics feed. Collapsed by default: the toggle sits
   in the lead row, so the closed strip is no taller than before. */
describe('NextDeadlineStrip — whole-year timeline (#2429)', () => {
  const toggle = () =>
    within(strip()).getByRole('button', { name: /see all deadlines/i })

  it('is collapsed by default', () => {
    render(<NextDeadlineStrip programYear="2026-2027" asOfDate="2026-11-15" />)
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('deadline-timeline')).toBeNull()
  })

  it('opens to every deadline of the year, grouped by month', () => {
    render(<NextDeadlineStrip programYear="2026-2027" asOfDate="2026-11-15" />)
    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    const panel = screen.getByTestId('deadline-timeline')
    expect(toggle()).toHaveAttribute('aria-controls', panel.id)
    const months = within(panel)
      .getAllByRole('heading', { level: 3 })
      .map(h => h.textContent)
    expect(months).toEqual([
      'August 2026',
      'September 2026',
      'October 2026',
      'November 2026',
      'February 2027',
      'April 2027',
      'May 2027',
    ])
    expect(within(panel).getAllByRole('listitem')).toHaveLength(8)
    fireEvent.click(toggle())
    expect(screen.queryByTestId('deadline-timeline')).toBeNull()
  })

  it('shows a cited owner as a link to its TI source, and no owner otherwise', () => {
    render(<NextDeadlineStrip programYear="2026-2027" asOfDate="2026-11-15" />)
    fireEvent.click(toggle())
    const items = within(screen.getByTestId('deadline-timeline')).getAllByRole(
      'listitem'
    )
    const item = (label: string) =>
      items.find(li => li.textContent?.includes(label))!
    const visits = item('Round 1 club visit reports due')
    expect(visits).toHaveTextContent('Owner: Area Director')
    const cite = within(visits).getByRole('link')
    expect(cite).toHaveAttribute(
      'href',
      'https://content.toastmasters.org/image/upload/1490-district-recognition-program.pdf'
    )
    expect(cite).toHaveTextContent('Item 1490, p. 11')
    expect(item('Round 2 officer training opens')).toHaveTextContent(
      'Owner: Program Quality Director'
    )
    for (const label of [
      'Club Success Plans due',
      'October dues renewal due',
      'April dues renewal due',
    ]) {
      expect(item(label)).not.toHaveTextContent('Owner')
      expect(within(item(label)).queryByRole('link')).toBeNull()
    }
  })

  it('marks the deadlines before the page date as passed (R3)', () => {
    render(<NextDeadlineStrip programYear="2026-2027" asOfDate="2026-11-15" />)
    fireEvent.click(toggle())
    const items = within(screen.getByTestId('deadline-timeline')).getAllByRole(
      'listitem'
    )
    expect(items[0]).toHaveTextContent('passed')
    expect(items[4]).toHaveTextContent('Round 1 club visit reports due')
    expect(items[4]).not.toHaveTextContent('passed')
  })

  it('offers the .ics feed of the same table', () => {
    render(<NextDeadlineStrip programYear="2026-2027" asOfDate="2026-11-15" />)
    fireEvent.click(toggle())
    const link = within(screen.getByTestId('deadline-timeline')).getByRole(
      'link',
      { name: /add to calendar/i }
    )
    expect(link).toHaveAttribute('href', '/deadlines.ics')
  })

  it('still offers the year once every deadline has passed', () => {
    render(<NextDeadlineStrip programYear="2026-2027" asOfDate="2027-06-10" />)
    fireEvent.click(toggle())
    expect(
      within(screen.getByTestId('deadline-timeline')).getAllByRole('listitem')
    ).toHaveLength(8)
  })
})
