/**
 * TopGrowthClubs — the DistrictAnalyticsPage panel (#1687).
 *
 * The page test mocks this component, so its own rendering never ran. These
 * tests mount the component alone (R22: no page mount) and assert ordering,
 * tie-aware ranks (#236), the empty and loading states, the summary math,
 * and the #1655 no-horizontal-scroll classes (name column truncates, value
 * column does not shrink).
 */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { TopGrowthClubs } from '../TopGrowthClubs'

const growth = [
  { clubId: '100', clubName: 'Alpha Speakers', growth: 12 },
  { clubId: '200', clubName: 'Beta Orators', growth: 8 },
  { clubId: '300', clubName: 'Gamma Voices', growth: 8 },
  { clubId: '400', clubName: 'Delta Talkers', growth: 5 },
  { clubId: '500', clubName: 'Epsilon Club', growth: 1 },
]

const dcp = [
  {
    clubId: '900',
    clubName: 'Smedley Stars',
    goalsAchieved: 10,
    distinguishedLevel: 'Smedley' as const,
  },
  {
    clubId: '901',
    clubName: 'Select Few',
    goalsAchieved: 7,
    distinguishedLevel: 'Select' as const,
  },
  { clubId: '902', clubName: 'Plain Club', goalsAchieved: 4 },
]

/** The row element (the bordered card) containing a club name. */
function rowFor(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { level: 4, name })
  const row = heading.closest('.border')
  if (!(row instanceof HTMLElement)) throw new Error(`no row for ${name}`)
  return row
}

function panelFor(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { level: 3, name: title })
  const panel = heading.closest('.redesign-panel')
  if (!(panel instanceof HTMLElement)) throw new Error(`no panel ${title}`)
  return panel
}

describe('TopGrowthClubs', () => {
  it('renders only a skeleton while loading', () => {
    const { container } = render(
      <TopGrowthClubs topGrowthClubs={growth} topDCPClubs={dcp} isLoading />
    )

    expect(container.querySelector('.animate-pulse')).not.toBeNull()
    expect(screen.queryByText('Top Growth Clubs')).toBeNull()
    expect(screen.queryByText('Alpha Speakers')).toBeNull()
  })

  it('lists growth clubs in the given (pre-sorted) order with +N members', () => {
    render(<TopGrowthClubs topGrowthClubs={growth} isLoading={false} />)

    const panel = panelFor('Top Growth Clubs')
    const names = within(panel)
      .getAllByRole('heading', { level: 4 })
      .map(h => h.textContent)
    expect(names).toEqual(growth.map(c => c.clubName))

    const alpha = rowFor('Alpha Speakers')
    expect(within(alpha).getByText('+12')).toBeInTheDocument()
    expect(within(alpha).getByText('Club #100')).toBeInTheDocument()
  })

  it('uses competition ranking for ties: 1, 2, 2, 4 — trophies for the top 3 ranks, numbers after', () => {
    render(<TopGrowthClubs topGrowthClubs={growth} isLoading={false} />)

    // Tied clubs are flagged; untied ones are not.
    expect(within(rowFor('Beta Orators')).getByText('(tied)')).toBeTruthy()
    expect(within(rowFor('Gamma Voices')).getByText('(tied)')).toBeTruthy()
    expect(within(rowFor('Alpha Speakers')).queryByText('(tied)')).toBeNull()

    // Rank 1 → gold trophy; ranks 2 (tied) → silver trophy for both.
    expect(
      rowFor('Alpha Speakers').querySelector('svg.text-yellow-500')
    ).not.toBeNull()
    expect(
      rowFor('Beta Orators').querySelector('svg.text-gray-400.w-6')
    ).not.toBeNull()
    expect(
      rowFor('Gamma Voices').querySelector('svg.text-gray-400.w-6')
    ).not.toBeNull()

    // Rank 4 (competition ranking skips 3) → a number, not a trophy.
    const delta = rowFor('Delta Talkers')
    expect(within(delta).getByText('4')).toBeInTheDocument()
    expect(delta.querySelector('svg.w-6')).toBeNull()
    expect(within(rowFor('Epsilon Club')).getByText('5')).toBeInTheDocument()
  })

  it('shows an up-trend icon for positive growth and a flat icon for zero growth', () => {
    render(
      <TopGrowthClubs
        topGrowthClubs={[
          { clubId: '1', clubName: 'Growing', growth: 2 },
          { clubId: '2', clubName: 'Flat', growth: 0 },
        ]}
        isLoading={false}
      />
    )

    expect(
      rowFor('Growing').querySelector('svg.w-5.text-green-600')
    ).not.toBeNull()
    const flat = rowFor('Flat')
    expect(flat.querySelector('svg.w-5.text-gray-400')).not.toBeNull()
    expect(flat.querySelector('svg.w-5.text-green-600')).toBeNull()
  })

  it('shows the empty state and a zero summary when there is no growth data', () => {
    render(<TopGrowthClubs topGrowthClubs={[]} isLoading={false} />)

    expect(screen.getByText('No growth data available')).toBeInTheDocument()
    expect(screen.getByText('+0')).toBeInTheDocument()
    expect(screen.getByText('members across top 0 clubs')).toBeInTheDocument()
  })

  it('treats a null/undefined growth list as empty instead of crashing', () => {
    render(
      <TopGrowthClubs
        topGrowthClubs={undefined as unknown as []}
        isLoading={false}
      />
    )
    expect(screen.getByText('No growth data available')).toBeInTheDocument()
  })

  it('sums growth across the listed clubs in Achievement Highlights', () => {
    render(<TopGrowthClubs topGrowthClubs={growth} isLoading={false} />)

    const highlights = panelFor('Achievement Highlights')
    expect(within(highlights).getByText('+34')).toBeInTheDocument()
    expect(
      within(highlights).getByText('members across top 5 clubs')
    ).toBeInTheDocument()
  })

  it('omits the DCP panel and the average card when no DCP clubs are given', () => {
    const { rerender } = render(
      <TopGrowthClubs topGrowthClubs={growth} isLoading={false} />
    )
    expect(screen.queryByText('Top DCP Goal Achievement')).toBeNull()
    expect(screen.queryByText('Average DCP Goals')).toBeNull()

    rerender(
      <TopGrowthClubs
        topGrowthClubs={growth}
        topDCPClubs={[]}
        isLoading={false}
      />
    )
    expect(screen.queryByText('Top DCP Goal Achievement')).toBeNull()
  })

  it('renders DCP clubs with goals, a proportional progress bar and the tier badge', () => {
    render(
      <TopGrowthClubs
        topGrowthClubs={growth}
        topDCPClubs={dcp}
        isLoading={false}
      />
    )

    const smedley = rowFor('Smedley Stars')
    expect(within(smedley).getByText('10')).toBeInTheDocument()
    expect(within(smedley).getByText('Smedley')).toBeInTheDocument()
    expect(
      (smedley.querySelector('.bg-tm-loyal-blue.h-2') as HTMLElement).style
        .width
    ).toBe('100%')

    const select = rowFor('Select Few')
    expect(within(select).getByText('Select')).toBeInTheDocument()
    expect(
      (select.querySelector('.bg-tm-loyal-blue.h-2') as HTMLElement).style.width
    ).toBe('70%')

    // No distinguished level → no badge, just the goals.
    const plain = rowFor('Plain Club')
    expect(within(plain).getByText('4')).toBeInTheDocument()
    expect(
      within(plain).queryByText(/^(Smedley|President|Select|Distinguished)$/)
    ).toBeNull()
  })

  it('averages DCP goals to one decimal place', () => {
    render(
      <TopGrowthClubs
        topGrowthClubs={growth}
        topDCPClubs={dcp}
        isLoading={false}
      />
    )

    const highlights = panelFor('Achievement Highlights')
    // (10 + 7 + 4) / 3 = 7.0
    expect(within(highlights).getByText('7.0')).toBeInTheDocument()
    expect(
      within(highlights).getByText('across top 3 clubs')
    ).toBeInTheDocument()
  })

  it('ranks tied DCP clubs together', () => {
    render(
      <TopGrowthClubs
        topGrowthClubs={[]}
        topDCPClubs={[
          { clubId: 'a', clubName: 'Tie One', goalsAchieved: 9 },
          { clubId: 'b', clubName: 'Tie Two', goalsAchieved: 9 },
          { clubId: 'c', clubName: 'Third', goalsAchieved: 6 },
          { clubId: 'd', clubName: 'Fourth', goalsAchieved: 2 },
        ]}
        isLoading={false}
      />
    )

    expect(within(rowFor('Tie One')).getByText('(tied)')).toBeTruthy()
    expect(within(rowFor('Tie Two')).getByText('(tied)')).toBeTruthy()
    // Competition ranking: 1, 1, 3 → 'Third' still gets the bronze trophy.
    expect(rowFor('Third').querySelector('svg.text-orange-600')).not.toBeNull()
    expect(within(rowFor('Fourth')).getByText('4')).toBeInTheDocument()
  })

  describe('#1655 — no horizontal scroll at 375/768', () => {
    it('lets the name column shrink and truncate while the value column keeps its width', () => {
      render(
        <TopGrowthClubs
          topGrowthClubs={[
            {
              clubId: '1',
              clubName:
                'An Extraordinarily Long Club Name That Would Overflow A Phone',
              growth: 3,
            },
          ]}
          topDCPClubs={[
            {
              clubId: '2',
              clubName: 'Another Very Long DCP Club Name For Narrow Screens',
              goalsAchieved: 5,
            },
          ]}
          isLoading={false}
        />
      )

      for (const name of [
        'An Extraordinarily Long Club Name That Would Overflow A Phone',
        'Another Very Long DCP Club Name For Narrow Screens',
      ]) {
        const heading = screen.getByRole('heading', { level: 4, name })
        expect(heading).toHaveClass('truncate')
        // Every flex ancestor up to the row must allow shrinking below
        // content width, or `truncate` never applies.
        expect(heading.closest('.flex-1.min-w-0')).not.toBeNull()
        const row = rowFor(name)
        const nameCol = row.firstElementChild as HTMLElement
        expect(nameCol).toHaveClass('min-w-0')
        const valueCol = row.lastElementChild as HTMLElement
        expect(valueCol).toHaveClass('shrink-0')
      }
    })

    it('stacks the highlight cards in one column below 980px', () => {
      render(
        <TopGrowthClubs
          topGrowthClubs={growth}
          topDCPClubs={dcp}
          isLoading={false}
        />
      )
      const grid = panelFor('Achievement Highlights').querySelector('.grid')
      expect(grid).toHaveClass('grid-cols-1')
      expect(grid).toHaveClass('min-[980px]:grid-cols-2')
    })
  })
})
