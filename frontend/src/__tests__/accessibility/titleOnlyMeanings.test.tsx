/**
 * #2644 — a meaning that lives only in a `title` attribute is invisible to
 * touch and keyboard users and unreliable for screen readers. Every `title`
 * on the elements below must have its text somewhere that is not the
 * attribute: in the element's own text (visible or `sr-only`), in its
 * `aria-label`, or in an element it points at with `aria-describedby`.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { NextDeadlineStrip } from '../../components/NextDeadlineStrip'
import { DeadlineTimeline } from '../../components/DeadlineTimeline'
import { ClubStatStrip } from '../../components/clubs/ClubStatStrip'
import { AwardsRaceSection } from '../../components/AwardsRaceSection'
import { AreaPerformanceRow } from '../../components/AreaPerformanceRow'
import { DistrictCell } from '../../components/rankingsCells'
import type { RankedDistrict } from '../../components/rankingsTableFeatures'
import type { RankingsTableMeta } from '../../components/rankingsTableFeatures'
import { withRecognitionState } from '../../test-utils/areaFixture'

afterEach(cleanup)

const squash = (s: string | null | undefined) =>
  (s ?? '').replace(/\s+/g, ' ').trim()

/** Every `[title]` under `root` whose text exists nowhere but the attribute. */
function titleOnlyMeanings(root: HTMLElement): string[] {
  const offenders: string[] = []
  root.querySelectorAll<HTMLElement>('[title]').forEach(el => {
    const title = squash(el.getAttribute('title'))
    if (title === '') return
    const described = (el.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map(id => squash(root.ownerDocument.getElementById(id)?.textContent))
    const places = [
      squash(el.textContent),
      squash(el.getAttribute('aria-label')),
      ...described,
      // A sibling sr-only note directly after the element (links).
      squash(el.nextElementSibling?.textContent),
    ]
    if (!places.some(p => p.includes(title))) offenders.push(title)
  })
  return offenders
}

const wrap = (ui: React.ReactElement) => (
  <MemoryRouter>
    <table>
      <tbody>{ui}</tbody>
    </table>
  </MemoryRouter>
)

describe('no meaning exists only in a title attribute (#2644)', () => {
  it('NextDeadlineStrip: the deadline source is readable text', () => {
    const { container } = render(
      <NextDeadlineStrip programYear="2026-2027" asOfDate="2026-10-26" />
    )
    expect(container.querySelectorAll('[title]').length).toBeGreaterThan(0)
    expect(titleOnlyMeanings(container)).toEqual([])
  })

  it('DeadlineTimeline: the source and the owner citation are readable text', () => {
    const { container } = render(
      <DeadlineTimeline id="t" programYear="2026-2027" asOfDate="2026-10-26" />
    )
    expect(container.querySelectorAll('[title]').length).toBeGreaterThan(0)
    expect(titleOnlyMeanings(container)).toEqual([])
  })

  it('ClubStatStrip: a stat helper (CSP, Net change) is readable text', () => {
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
    expect(container.querySelectorAll('[title]').length).toBeGreaterThan(0)
    expect(titleOnlyMeanings(container)).toEqual([])
  })

  it('AwardsRaceSection: "tied" names the unpublished tie-break as text', () => {
    const tiedRow = (districtId: string) => ({
      districtId,
      districtName: `District ${districtId}`,
      region: '1',
      rank: 1,
      value: 100,
      isWinner: true,
    })
    const rows = ['93', '49', '104'].map(tiedRow)
    const { container } = render(
      <MemoryRouter>
        <AwardsRaceSection
          standings={
            {
              asOfDate: '2026-10-26',
              retentionAward: rows,
            } as unknown as React.ComponentProps<
              typeof AwardsRaceSection
            >['standings']
          }
        />
      </MemoryRouter>
    )
    expect(container.querySelectorAll('[title]').length).toBeGreaterThan(0)
    expect(titleOnlyMeanings(container)).toEqual([])
  })

  it('AreaPerformanceRow: the recognition badge meaning is readable text', () => {
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
    const { container } = render(wrap(<AreaPerformanceRow area={area} />))
    expect(container.querySelectorAll('[title]').length).toBeGreaterThan(0)
    expect(titleOnlyMeanings(container)).toEqual([])
  })

  it('DistrictCell: the my-district star explains itself in text', () => {
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
    expect(container.querySelectorAll('[title]').length).toBeGreaterThan(0)
    expect(titleOnlyMeanings(container)).toEqual([])
  })
})
