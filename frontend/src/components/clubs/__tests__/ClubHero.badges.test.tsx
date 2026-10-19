/**
 * #2171 — the hero's top-right badges are one quiet outline chip
 * (`.club-hero__chip`), and the anniversary chip shows only within 30 days
 * of the anniversary (either side), never otherwise.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { ClubHero } from '../ClubHero'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function renderHeroOn(today: string, charterDate: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${today}T12:00:00Z`))
  return render(
    <MemoryRouter>
      <ClubHero
        clubId="5193"
        districtId="80"
        club={{
          clubName: 'Example Club',
          areaName: 'Area 1',
          divisionName: 'Division A',
          charterDate,
        }}
        controls={null}
        statusPills={null}
      />
    </MemoryRouter>
  )
}

const anniversaryChip = () =>
  document.querySelector('.club-hero__anniversary .club-hero__chip')

describe('ClubHero anniversary chip — 30-day rule (#2171)', () => {
  it('shows the chip 30 days before the anniversary', () => {
    renderHeroOn('2026-10-19', '1990-11-18')
    expect(anniversaryChip()).toHaveTextContent('36th anniversary in 30 days')
  })

  it('omits the chip 31 days before the anniversary', () => {
    renderHeroOn('2026-10-18', '1990-11-18')
    expect(anniversaryChip()).toBeNull()
    expect(document.querySelector('.club-hero__anniversary')).toBeNull()
  })

  it('shows the chip on the day', () => {
    renderHeroOn('2026-11-18', '1990-11-18')
    expect(anniversaryChip()).toHaveTextContent('36th anniversary today')
  })

  it('shows the chip 30 days after the anniversary, in the past tense', () => {
    renderHeroOn('2026-12-18', '1990-11-18')
    expect(anniversaryChip()).toHaveTextContent('36th anniversary 30 days ago')
  })

  it('omits the chip 31 days after the anniversary', () => {
    renderHeroOn('2026-12-19', '1990-11-18')
    expect(anniversaryChip()).toBeNull()
  })

  it('omits the chip far from the anniversary, even in a milestone year', () => {
    renderHeroOn('2026-05-01', '2001-11-18') // 24 years, 25th in Nov
    expect(anniversaryChip()).toBeNull()
  })

  it('never renders an emoji', () => {
    renderHeroOn('2026-11-18', '2001-11-18') // 25th, a milestone, today
    const chip = anniversaryChip()
    expect(chip).toHaveTextContent('25th anniversary today')
    expect(chip?.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
