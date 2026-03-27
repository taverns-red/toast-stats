import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DivisionHeatmap } from '../DivisionHeatmap'
import type { DivisionHeatmapData } from '@toastmasters/analytics-core'

const mockData: DivisionHeatmapData[] = [
  {
    divisionId: 'A',
    divisionName: 'Division A',
    cells: [
      {
        metric: 'clubHealth',
        label: 'Club Health',
        rawValue: 0.75,
        score: 0.75,
      },
      {
        metric: 'dcpProgress',
        label: 'DCP Progress',
        rawValue: 3.5,
        score: 0.35,
      },
      {
        metric: 'membershipDensity',
        label: 'Membership Density',
        rawValue: 18,
        score: 0.6,
      },
    ],
  },
  {
    divisionId: 'B',
    divisionName: 'Division B',
    cells: [
      { metric: 'clubHealth', label: 'Club Health', rawValue: 1, score: 1 },
      { metric: 'dcpProgress', label: 'DCP Progress', rawValue: 7, score: 0.7 },
      {
        metric: 'membershipDensity',
        label: 'Membership Density',
        rawValue: 22,
        score: 0.73,
      },
    ],
  },
]

describe('DivisionHeatmap', () => {
  it('should render nothing for empty data', () => {
    const { container } = render(<DivisionHeatmap data={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('should render division names', () => {
    render(<DivisionHeatmap data={mockData} />)
    expect(screen.getByText('Division A')).toBeDefined()
    expect(screen.getByText('Division B')).toBeDefined()
  })

  it('should render metric headers', () => {
    render(<DivisionHeatmap data={mockData} />)
    expect(screen.getByText('Club Health')).toBeDefined()
    expect(screen.getByText('DCP Progress')).toBeDefined()
    expect(screen.getByText('Membership Density')).toBeDefined()
  })

  it('should render raw values in cells', () => {
    render(<DivisionHeatmap data={mockData} />)
    expect(screen.getByText('0.75')).toBeDefined()
    expect(screen.getByText('3.5')).toBeDefined()
  })

  it('should have accessible grid role', () => {
    render(<DivisionHeatmap data={mockData} />)
    expect(
      screen.getByRole('grid', { name: /Division health heatmap/ })
    ).toBeDefined()
  })

  it('should render gridcells with background colors', () => {
    render(<DivisionHeatmap data={mockData} />)
    const cells = screen.getAllByRole('gridcell')
    expect(cells.length).toBe(6) // 2 divisions × 3 metrics
    // Each cell should have a background-color style
    cells.forEach(cell => {
      expect(cell.style.backgroundColor).toBeDefined()
    })
  })
})
