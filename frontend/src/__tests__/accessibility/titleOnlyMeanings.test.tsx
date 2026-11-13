/**
 * #2644 — a meaning that lives only in a `title` attribute is invisible to
 * touch and keyboard users, and a meaning that lives only in `sr-only` text is
 * invisible to sighted touch users. Each site below must put its meaning
 * behind an InfoTooltip trigger (a named button that opens by tap, click,
 * focus or hover): opening it shows the text, and the same text is not also
 * left in the DOM as an `sr-only` duplicate that a screen reader would hear
 * twice.
 */

import { describe, it, expect, afterEach } from 'vitest'
import {
  render,
  cleanup,
  screen,
  fireEvent,
  within,
} from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { NextDeadlineStrip } from '../../components/NextDeadlineStrip'
import { DeadlineTimeline } from '../../components/DeadlineTimeline'
import { ClubStatStrip } from '../../components/clubs/ClubStatStrip'
import { AwardsRaceSection } from '../../components/AwardsRaceSection'
import { AreaPerformanceRow } from '../../components/AreaPerformanceRow'
import { DistrictCell } from '../../components/rankingsCells'
import type {
  RankedDistrict,
  RankingsTableMeta,
} from '../../components/rankingsTableFeatures'
import { withRecognitionState } from '../../test-utils/areaFixture'

afterEach(cleanup)

const squash = (s: string | null | undefined) =>
  (s ?? '').replace(/\s+/g, ' ').trim()

/** Text of every sr-only node under `root`. */
function srOnlyText(root: HTMLElement): string {
  return squash(
    Array.from(root.querySelectorAll('.sr-only'))
      .map(n => n.textContent)
      .join(' ')
  )
}

/** Opens `trigger` the way a touch tap does and returns the panel text. */
function openAndRead(trigger: HTMLElement): string {
  fireEvent.focus(trigger)
  fireEvent.click(trigger)
  return squash(screen.getByRole('tooltip').textContent)
}

describe('meanings are reachable by touch and not announced twice (#2644)', () => {
  it('NextDeadlineStrip: the deadline source opens from a button', () => {
    const { container } = render(
      <NextDeadlineStrip programYear="2026-2027" asOfDate="2026-10-26" />
    )
    const item = within(container).getAllByRole('listitem')[0]!
    const trigger = within(item).getByRole('button', {
      name: /^About .*source/i,
    })
    expect(openAndRead(trigger)).toMatch(/^Source: /)
    expect(srOnlyText(container)).not.toMatch(/Source:/)
  })

  it('DeadlineTimeline: the source and the owner citation open from buttons', () => {
    const { container } = render(
      <DeadlineTimeline id="t" programYear="2026-2027" asOfDate="2026-10-26" />
    )
    const sources = within(container).getAllByRole('button', {
      name: /^About .*source/i,
    })
    expect(sources.length).toBeGreaterThan(0)
    expect(openAndRead(sources[0]!)).toMatch(/^Source: /)
    expect(srOnlyText(container)).not.toMatch(/Source:/)
    expect(container.querySelectorAll('a[title]')).toHaveLength(0)
    expect(
      within(container).getAllByRole('button', { name: /citation$/i }).length
    ).toBeGreaterThan(0)
  })

  it('ClubStatStrip: a stat helper (CSP, Net change) opens from a button', () => {
    const { container } = render(
      <MemoryRouter>
        <ClubStatStrip
          stats={[
            {
              label: 'Net Δ',
              value: '+2',
              valClass: 'pos',
              title: 'Net change since July',
            },
            {
              label: 'CSP',
              value: '✓',
              valClass: 'tick',
              title: 'Club Success Plan: Submitted',
            },
          ]}
        />
      </MemoryRouter>
    )
    const trigger = screen.getByRole('button', { name: 'About CSP' })
    expect(openAndRead(trigger)).toBe('Club Success Plan: Submitted')
    expect(container.querySelectorAll('[title]')).toHaveLength(0)
    expect(srOnlyText(container)).not.toMatch(/Club Success Plan/)
  })

  it('AwardsRaceSection: the tie-break note opens from a button', () => {
    const tiedRow = (districtId: string) => ({
      districtId,
      districtName: `District ${districtId}`,
      region: '1',
      rank: 1,
      value: 100,
      isWinner: true,
    })
    const { container } = render(
      <MemoryRouter>
        <AwardsRaceSection
          standings={
            {
              asOfDate: '2026-10-26',
              retentionAward: ['93', '49', '104'].map(tiedRow),
            } as unknown as React.ComponentProps<
              typeof AwardsRaceSection
            >['standings']
          }
        />
      </MemoryRouter>
    )
    const trigger = screen.getByRole('button', {
      name: /^About the tie-break/i,
    })
    expect(openAndRead(trigger)).toMatch(/tie-break isn.t published/i)
    expect(container.querySelectorAll('[title]')).toHaveLength(0)
    expect(srOnlyText(container)).not.toMatch(/tie-break/i)
  })

  it('AreaPerformanceRow: the recognition badge meaning opens from a button', () => {
    const area = withRecognitionState(
      {
        areaId: 'A1',
        status: 'distinguished',
        clubBase: 10,
        paidClubs: 10,
        netGrowth: 0,
        distinguishedClubs: 5,
        requiredDistinguishedClubs: 5,
        firstRoundVisits: {
          completed: 8,
          required: 8,
          percentage: 80,
          meetsThreshold: true,
        },
        // Round 2 unmet mid-year: a provisional badge, which carries a tooltip.
        secondRoundVisits: {
          completed: 2,
          required: 8,
          percentage: 25,
          meetsThreshold: false,
        },
        isQualified: true,
      },
      '2026-03-15'
    )
    const { container } = render(
      <MemoryRouter>
        <table>
          <tbody>
            <AreaPerformanceRow area={area} />
          </tbody>
        </table>
      </MemoryRouter>
    )
    const trigger = screen.getByRole('button', {
      name: /^About .*recognition/i,
    })
    expect(openAndRead(trigger).length).toBeGreaterThan(10)
    expect(container.querySelectorAll('[title]')).toHaveLength(0)
    expect(srOnlyText(container)).toBe('')
  })

  it('DistrictCell: the star helper is read once (its describedby target is hidden)', () => {
    const meta = {
      isMyDistrict: () => false,
      setMyDistrict: () => undefined,
      competitiveAwards: null,
      clubGrowthHeld: new Map(),
    } as unknown as RankingsTableMeta
    const district = {
      districtId: '61',
      districtName: 'District 61',
    } as unknown as RankedDistrict
    const { container } = render(
      <MemoryRouter>
        <DistrictCell district={district} meta={meta} />
      </MemoryRouter>
    )
    const star = container.querySelector<HTMLElement>(
      'button[aria-describedby]'
    )
    expect(star).not.toBeNull()
    const target = container.ownerDocument.getElementById(
      star!.getAttribute('aria-describedby')!
    )
    expect(squash(target?.textContent)).toMatch(/pins to top/)
    // A node a screen reader also meets in reading order would be announced
    // twice: once in the flow, once as the description.
    expect(target).toHaveAttribute('aria-hidden', 'true')
  })
})
