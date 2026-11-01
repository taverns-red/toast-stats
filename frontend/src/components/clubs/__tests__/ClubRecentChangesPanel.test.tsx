import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ClubRecentChangesPanel } from '../ClubRecentChangesPanel'
import {
  formatFeedWindow,
  type ClubChangeFeed,
} from '../../../utils/clubChangeFeed'

/**
 * #2430 — "Recent changes" on the club page: one dated line per change,
 * newest first, bounded, with a link to the full history. A reason shows
 * only when the feed carries one, and the panel then cites the TI rule.
 */
const FEED: ClubChangeFeed = {
  entries: [
    {
      key: '2026-10-31:membership',
      category: 'membership',
      fromDate: '2026-10-22',
      toDate: '2026-10-31',
      text: 'Gained 1 member',
      magnitude: 1,
      spansMissingData: false,
    },
    {
      key: '2026-10-08:membership',
      category: 'membership',
      fromDate: '2026-09-30',
      toDate: '2026-10-08',
      text: 'Lost 7 members',
      magnitude: -7,
      spansMissingData: true,
      reason: {
        text: 'Across the October 1 dues renewal deadline',
        source:
          'Distinguished Club Program, Item 1111 Rev. 06/2026, p. 8 (goal 10); https://www.toastmasters.org/footer/faq/Renewal-Dues',
      },
    },
  ],
  totalEvents: 11,
  truncated: true,
  comparable: true,
  hasReasons: true,
  windowStart: '2026-08-11',
  windowEnd: '2026-10-31',
  unavailableDates: ['2026-10-03'],
}

function renderPanel(
  props: Partial<React.ComponentProps<typeof ClubRecentChangesPanel>> = {}
) {
  return render(
    <MemoryRouter>
      <ClubRecentChangesPanel
        feed={FEED}
        isLoading={false}
        historyHref="/district/61/club/7238597/history"
        {...props}
      />
    </MemoryRouter>
  )
}

describe('formatFeedWindow (#2430)', () => {
  it('shortens a same-month window and spells out a cross-month one', () => {
    expect(formatFeedWindow('2026-10-22', '2026-10-31')).toBe('Oct 22–31')
    expect(formatFeedWindow('2026-09-30', '2026-10-08')).toBe('Sep 30 – Oct 8')
    expect(formatFeedWindow('2025-12-28', '2026-01-04')).toBe(
      'Dec 28, 2025 – Jan 4, 2026'
    )
  })
})

describe('ClubRecentChangesPanel (#2430)', () => {
  it('lists one dated line per change, newest first', () => {
    renderPanel()
    const region = screen.getByRole('region', { name: /recent changes/i })
    const items = within(region).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Oct 22–31')
    expect(items[0]).toHaveTextContent('Gained 1 member')
    expect(items[1]).toHaveTextContent('Sep 30 – Oct 8')
    expect(items[1]).toHaveTextContent('Lost 7 members')
    const time = items[0]!.querySelector('time')
    expect(time?.getAttribute('dateTime')).toBe('2026-10-31')
  })

  it('shows a reason only where the feed carries one, and cites the rule', () => {
    renderPanel()
    const items = screen.getAllByRole('listitem')
    expect(items[0]).not.toHaveTextContent(/dues/i)
    expect(items[1]).toHaveTextContent(
      'Across the October 1 dues renewal deadline'
    )
    const cite = screen.getByRole('link', { name: /renewal dues faq/i })
    expect(cite).toHaveAttribute(
      'href',
      'https://www.toastmasters.org/footer/faq/Renewal-Dues'
    )
  })

  it('cites nothing when no line has a reason', () => {
    renderPanel({
      feed: {
        ...FEED,
        hasReasons: false,
        entries: [FEED.entries[0]!],
      },
    })
    expect(
      screen.queryByRole('link', { name: /renewal dues faq/i })
    ).not.toBeInTheDocument()
  })

  it('marks a window that bridges missing data, and says how much is missing', () => {
    renderPanel()
    const items = screen.getAllByRole('listitem')
    expect(items[1]).toHaveTextContent(/includes a date with no data/i)
    expect(items[0]).not.toHaveTextContent(/no data/i)
    expect(
      screen.getByText(/no data for 1 date in this period/i)
    ).toBeInTheDocument()
  })

  it('is bounded: says how many changes there were and links to the full history', () => {
    renderPanel()
    expect(
      screen.getByText(/showing the latest 2 of 11 changes/i)
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /full history/i })).toHaveAttribute(
      'href',
      '/district/61/club/7238597/history'
    )
  })

  it('says so when nothing changed', () => {
    renderPanel({
      feed: {
        ...FEED,
        entries: [],
        totalEvents: 0,
        truncated: false,
        hasReasons: false,
        unavailableDates: [],
      },
    })
    expect(
      screen.getByText(/no changes recorded between aug 11 and oct 31/i)
    ).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('says so when there is too little data to compare', () => {
    renderPanel({
      feed: { ...FEED, entries: [], comparable: false, totalEvents: 0 },
    })
    expect(
      screen.getByText(/not enough recorded dates in the last 90 days/i)
    ).toBeInTheDocument()
  })

  it('reserves its rows while loading', () => {
    renderPanel({ feed: null, isLoading: true })
    const region = screen.getByRole('region', { name: /recent changes/i })
    expect(region).toHaveAttribute('aria-busy', 'true')
    expect(
      region.querySelectorAll('.club-changes__row--skeleton').length
    ).toBeGreaterThan(0)
  })
})
