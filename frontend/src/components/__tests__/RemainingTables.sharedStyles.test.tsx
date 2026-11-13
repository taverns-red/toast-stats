/**
 * M7 of the clubs table spec (#2676, sub-issue #2734): the remaining
 * styles-only tables take the shared `.dt` chrome, a caption, `th scope` and a
 * labelled, focusable scroller where they scroll sideways. The spec's red test
 * for each table: no CSS-hidden columns, a 14px floor, caption and scope.
 *
 * DOM assertions read real elements. CSS assertions read the stylesheets as
 * text, because jsdom has no layout engine (lesson 075). No page mounts (R22).
 */

import React from 'react'
import { describe, expect, it, afterEach, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CharterCohortSurvivalRollupFileSchema,
  charterCohortSurvivalFromRollupFile,
  type GlobalClubRaceReached,
} from '@taverns-red/shared-contracts'
import r09File from '../../__tests__/fixtures/charter-cohort-survival-region-09.json'
import { CharterSurvivalView } from '../CharterSurvivalView'
import { WorldwideScoreboard } from '../WorldwideScoreboard'
import { WorldPulse } from '../WorldPulse'
import { RankingsChangesView } from '../rollups/RankingsChangesView'
import { RollupPanels } from '../rollups/RollupPanels'
import MultiYearComparisonTable from '../MultiYearComparisonTable'
import { RaceTable } from '../clubs/RaceTable'
import { CountryRankTable } from '../worldmap/CountryRankTable'
import { buildChoroplethView } from '../worldmap/countryChoroplethView'
import { DistinguishedDistrictTrophyCase } from '../DistinguishedDistrictTrophyCase'
import {
  globalHistoryFixture,
  globalTotalsFixture,
} from '../../__tests__/fixtures/globalHistory'
import recordedRollups from '../../__tests__/fixtures/region-rollups-2026-10-15.recorded.json'
import { RegionRollupsSchema } from '@taverns-red/shared-contracts'
import { toSnapshotDate } from '../../types/snapshotDate'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../hooks/useRegionRollups', () => ({
  useRegionRollups: () => ({
    rollups: null,
    snapshotDate: null,
    isLoading: false,
  }),
}))
vi.mock('../../services/cdn', () => ({
  fetchCdnRegionMembershipSeries: vi.fn().mockResolvedValue(null),
}))

afterEach(() => cleanup())

const SRC = join(__dirname, '..', '..')
const read = (rel: string): string => readFileSync(join(SRC, rel), 'utf-8')

/** The shared contract for one rendered table. */
function expectSharedTable(
  table: HTMLElement,
  opts: { scroller?: boolean } = {}
): void {
  expect(table).toHaveClass('dt')
  const caption = table.querySelector(':scope > caption')
  expect(caption).not.toBeNull()
  expect((caption?.textContent ?? '').trim()).not.toBe('')
  for (const th of table.querySelectorAll('th'))
    expect(th.getAttribute('scope')).toMatch(/^(col|row|colgroup|rowgroup)$/)
  if (opts.scroller) {
    const region = table.closest('[role="region"]')
    expect(region).not.toBeNull()
    expect(region).toHaveAttribute('tabindex', '0')
    expect(region?.getAttribute('aria-label') ?? '').not.toBe('')
  }
}

const tables = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>('table'))

describe('M7 tables: shared .dt chrome, caption, scope (#2676)', () => {
  it('#5 worldwide scoreboard: both tables', () => {
    render(
      <MemoryRouter>
        <WorldwideScoreboard
          history={globalHistoryFixture}
          historyLoading={false}
          historyError={false}
          clubsByCountry={globalTotalsFixture.clubsByCountry}
          clubsCounted={globalTotalsFixture.membership.clubsCounted}
          countrySnapshotDate={globalTotalsFixture.date}
          countryLoading={false}
          countryError={false}
        />
      </MemoryRouter>
    )
    const all = tables()
    expect(all).toHaveLength(2)
    for (const t of all) expectSharedTable(t, { scroller: true })
  })

  it('#6 world pulse', () => {
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <WorldPulse
            rows={[
              {
                districtId: '61',
                region: '05',
                paidClubs: 139,
                paidClubBase: 158,
                totalPayments: 3000,
                paymentBase: 5000,
              },
            ]}
            date={toSnapshotDate('2026-10-22')!}
            programYear="2026-2027"
          />
        </MemoryRouter>
      </QueryClientProvider>
    )
    expectSharedTable(screen.getByRole('table', { name: /regions/i }))
  })

  it('#17 charter survival', () => {
    const survival = charterCohortSurvivalFromRollupFile(
      CharterCohortSurvivalRollupFileSchema.parse(r09File),
      '2026-2027'
    )
    render(
      <MemoryRouter>
        <CharterSurvivalView
          survival={survival}
          scope={{ kind: 'region', regionId: '09' }}
        />
      </MemoryRouter>
    )
    expectSharedTable(screen.getByRole('table'), { scroller: true })
  })

  it('#23 rankings changes: districts and regions tables', () => {
    const row = (districtId: string, region: string) => ({
      districtId,
      districtName: `District ${districtId}`,
      region,
      paidClubs: 100,
      totalPayments: 1000,
      distinguishedClubs: 10,
      aggregateScore: 50,
      overallRank: 10,
      newCharteredClubs: 1,
      suspendedClubs: 1,
    })
    const rows = [row('61', '05'), row('9', '07')]
    const byRow = (r: { region: string }) => r.region
    for (const region of ['05', undefined]) {
      render(
        <MemoryRouter>
          <RankingsChangesView
            scopeLabel={region ? `Region ${region}` : 'All regions'}
            region={region}
            from="2026-10-01"
            to="2026-10-31"
            fromRows={rows}
            toRows={rows}
            regionOfFrom={byRow}
            regionOfTo={byRow}
          />
        </MemoryRouter>
      )
      const all = tables()
      expect(all).toHaveLength(1)
      expectSharedTable(all[0]!, { scroller: true })
      cleanup()
    }
  })

  it('#24 rollup panels', () => {
    const world = RegionRollupsSchema.parse(recordedRollups).world
    render(
      <RollupPanels
        figures={world}
        programYear="2026-2027"
        snapshotDate="2026-10-15"
        scopeLabel="worldwide"
      />
    )
    const all = tables()
    expect(all.length).toBeGreaterThan(0)
    for (const t of all) expectSharedTable(t)
  })

  it('#25 multi-year comparison: scroller, caption, row header', () => {
    render(
      <MultiYearComparisonTable
        yearlyRankings={[
          {
            programYear: '2023-2024',
            overallRank: 15,
            clubsRank: 12,
            paymentsRank: 18,
            distinguishedRank: 20,
            totalDistricts: 126,
            isPartialYear: false,
            yearOverYearChange: null,
          },
        ]}
      />
    )
    const table = screen.getByRole('table')
    expectSharedTable(table, { scroller: true })
    expect(table.querySelector('tbody th[scope="row"]')).not.toBeNull()
  })

  it('#26 clubs race: club name is the row header', () => {
    const row = {
      clubId: '3045',
      clubName: 'Club 3045',
      districtId: '61',
      current: null,
      tiers: {
        Distinguished: {
          reachedOn: '2026-08-12',
          observedAfter: '2026-08-11',
          rank: 1,
        },
      },
      official: null,
    } as unknown as GlobalClubRaceReached
    render(
      <MemoryRouter>
        <RaceTable tier="Distinguished" rows={[row]} />
      </MemoryRouter>
    )
    const table = screen.getByRole('table')
    expectSharedTable(table, { scroller: true })
    expect(
      table.querySelector('tbody th[scope="row"] a[href*="/club/3045"]')
    ).not.toBeNull()
  })

  it('#27 country rank table', () => {
    const view = buildChoroplethView(
      [{ country: 'Canada', clubs: 922 }],
      342,
      8024,
      () => 'polygon'
    )
    render(
      <CountryRankTable view={view} selectedId={null} onSelect={vi.fn()} />
    )
    expectSharedTable(screen.getByRole('table'))
  })

  it('#28 trophy case: tier table is plain text at the 14px floor', () => {
    render(
      <DistinguishedDistrictTrophyCase
        programYear="2026-2027"
        status={{
          districtId: '61',
          currentTier: 'NotDistinguished',
          allPrerequisitesMet: true,
          prerequisites: {
            dspSubmitted: true,
            trainingMet: true,
            marketAnalysisSubmitted: true,
            communicationPlanSubmitted: true,
            regionAdvisorVisitMet: false,
          },
          nextTierGap: {
            tier: 'Distinguished',
            paymentGrowthGap: 40.6,
            clubGrowthGap: 13.03,
            distinguishedPercentGap: 43.1,
            netClubGrowthGap: 19,
            paidClubBase: 158,
            paymentBase: 5886,
          },
          paymentsRemaining: 2390,
          paidClubsRemaining: 21,
          distinguishedClubsRemaining: 69,
        }}
        ranking={{
          paidClubBase: 158,
          paymentBase: 5886,
          paidClubs: 139,
          totalPayments: 3555,
          distinguishedClubs: 3,
        }}
      />
    )
    const table = screen
      .getByTestId('distinguished-tier-gaps')
      .querySelector('table')!
    expectSharedTable(table)
    expect(table.querySelector('.text-xs')).toBeNull()
    // Tier is plain text: no fill or border utility on a tier cell.
    for (const th of table.querySelectorAll('tbody th'))
      expect(th.className).not.toMatch(/\bbg-|\bborder-(?!t\b)/)
  })
})

/* ── Stylesheets: no sub-14px text, no CSS-hidden columns ───────────────── */

interface Rule {
  selector: string
  body: string
}

function rulesOf(file: string): Rule[] {
  const css = read(file).replace(/\/\*[\s\S]*?\*\//g, '')
  const out: Rule[] = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    out.push({ selector: m[1]!.trim(), body: m[2]! })
  return out
}

const pxOf = (v: string): number | null => {
  const m = v.trim().match(/^(\d*\.?\d+)(px|rem|em)$/)
  if (!m) return null
  return Number(m[1]) * (m[2] === 'px' ? 1 : 16)
}

/** [stylesheet, selector pattern for rules that style the table's text]. */
const TABLE_STYLES: Array<[string, RegExp]> = [
  [
    'styles/components/worldwide-scoreboard.css',
    /\.wws__(table|metric|year-head|group|basis|cell|num|row)/,
  ],
  ['styles/components/landing-pulse.css', /\.world-pulse__(table|num|th)/],
  ['styles/components/survival.css', /\.survival-table/],
  ['styles/components/district-changes.css', /\.rankings-changes__table/],
  ['components/rollups/rollups.css', /\.rollup-(table|row)/],
  ['styles/components/clubs-race.css', /\.race-(table|official|goal-strip)/],
  ['components/worldmap/worldmap.css', /\.wm-table(?!-scroll)/],
]

describe('M7 stylesheets: 14px floor, no CSS-hidden columns (#2676)', () => {
  it.each(TABLE_STYLES)('%s: no table text under 14px', (file, pattern) => {
    const offenders: string[] = []
    for (const r of rulesOf(file)) {
      if (!pattern.test(r.selector)) continue
      for (const d of r.body.matchAll(/(?:^|[;\s])font-size\s*:\s*([^;]+)/g)) {
        const px = pxOf(d[1]!)
        if (px !== null && px < 14)
          offenders.push(`${r.selector.slice(0, 60)} ${d[1]!.trim()}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it.each(TABLE_STYLES)('%s: no column is hidden by CSS', (file, pattern) => {
    const offenders: string[] = []
    for (const r of rulesOf(file)) {
      if (!pattern.test(r.selector)) continue
      if (
        /(?:^|[\s>+~,])(?:th|td)\b|nth-child|nth-of-type|\bcol\b/.test(
          r.selector
        ) &&
        /display\s*:\s*none/.test(r.body)
      )
        offenders.push(r.selector.slice(0, 80))
    }
    expect(offenders).toEqual([])
  })
})
