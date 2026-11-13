import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatTile, StatTileList } from '../StatTile'

describe('StatTile (#2649)', () => {
  it('draws label, then value, then hint, in that order', () => {
    render(
      <ul>
        <StatTile
          family="education-kpi"
          label="Awards this year"
          value="1,234"
          hint="so far"
        />
      </ul>
    )
    const tile = screen.getByRole('listitem')
    const parts = Array.from(tile.children).map(c => c.textContent)
    expect(parts).toEqual(['Awards this year', '1,234', 'so far'])
  })

  it('keeps the family class hooks next to the shared ones', () => {
    render(
      <ul>
        <StatTile family="meetings-kpi" label="Meet in person" value="12" />
      </ul>
    )
    const tile = screen.getByRole('listitem')
    expect(tile).toHaveClass('stat-tile', 'meetings-kpi')
    expect(screen.getByText('Meet in person')).toHaveClass(
      'stat-tile__label',
      'meetings-kpi__label'
    )
    expect(screen.getByText('12')).toHaveClass(
      'stat-tile__value',
      'meetings-kpi__value'
    )
  })

  it('omits the hint element when there is no hint', () => {
    render(
      <ul>
        <StatTile family="survival-kpi" label="After 1 year" value="80%" />
      </ul>
    )
    expect(screen.getByRole('listitem').children).toHaveLength(2)
  })

  it('adds the value modifier class when given', () => {
    render(
      <ul>
        <StatTile
          family="education-kpi"
          label="Triple Crown"
          value="Not measured"
          valueClassName="is-unknown"
        />
      </ul>
    )
    expect(screen.getByText('Not measured')).toHaveClass(
      'stat-tile__value',
      'is-unknown'
    )
  })

  it('renders rich values (a link) inside the value element', () => {
    render(
      <ul>
        <StatTile
          family="meetings-kpi"
          label="Schedule not stated"
          value={<a href="/x">3</a>}
        />
      </ul>
    )
    expect(screen.getByRole('link', { name: '3' }).parentElement).toHaveClass(
      'stat-tile__value'
    )
  })
})

describe('StatTileList', () => {
  it('is a labelled list carrying the family strip class and columns', () => {
    render(
      <StatTileList
        family="education-kpis"
        aria-label="At a glance"
        data-testid="strip"
      >
        <StatTile family="education-kpi" label="A" value="1" />
      </StatTileList>
    )
    const list = screen.getByRole('list', { name: 'At a glance' })
    expect(list).toHaveClass('stat-tiles', 'education-kpis')
    expect(list).toHaveAttribute('data-testid', 'strip')
  })
})
