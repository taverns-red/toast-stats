import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import type { RegionRollups } from '@taverns-red/shared-contracts'
import { RegionsTrainingWorld } from '../RegionsTrainingWorld'
import { regionsTrainingOverview } from '../../utils/regionTraining'

/* #2330 — the world figure the /regions training columns are read
   against: Round 1 and Round 2 at 4+ (DCP goal 9) and all seven, from the
   world block of the date's region-rollups.json. */

afterEach(() => cleanup())

const dist = (atZero: number, atFour: number, atSeven: number) => [
  atZero,
  0,
  0,
  0,
  atFour,
  0,
  0,
  atSeven,
]
const FILE = {
  world: {
    officerTraining: { round1: dist(2, 5, 3), round2: dist(6, 3, 1) },
  },
  regions: {},
} as unknown as RegionRollups

const renderWorld = (date: string, file: RegionRollups | null = FILE) =>
  render(
    <MemoryRouter>
      <RegionsTrainingWorld
        overview={regionsTrainingOverview(file, date, '2026-2027')}
      />
    </MemoryRouter>
  )

describe('RegionsTrainingWorld (#2330)', () => {
  it('states the world Round 1 figures at 4+ and all seven', () => {
    renderWorld('2026-10-25')
    const box = screen.getByTestId('regions-training-world')
    expect(box).toHaveTextContent(/World/)
    expect(box).toHaveTextContent(/Round 1 \(Jun–Aug\): 80% .*4\+ officers/)
    expect(box).toHaveTextContent(/30% .*all seven/)
  })

  it('Round 2 before November: not started, with its opening date', () => {
    renderWorld('2026-10-25')
    expect(screen.getByTestId('regions-training-world')).toHaveTextContent(
      /Round 2 \(Nov–Feb\): not started · opens Nov 1/
    )
  })

  it('Round 2 once open: its figures', () => {
    renderWorld('2026-11-20')
    expect(screen.getByTestId('regions-training-world')).toHaveTextContent(
      /Round 2 \(Nov–Feb\): 40% .*10% /
    )
  })

  it('a date without the figures says "not available", never 0%', () => {
    renderWorld('2026-10-01', null)
    const box = screen.getByTestId('regions-training-world')
    expect(box).toHaveTextContent(/not available for this date/)
    expect(box).not.toHaveTextContent('0%')
  })

  it('links to how the figure is counted', () => {
    renderWorld('2026-10-25')
    expect(
      screen.getByRole('link', { name: 'How this is counted' })
    ).toHaveAttribute('href', '/methodology#officer-training')
  })
})
