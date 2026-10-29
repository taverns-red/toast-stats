/**
 * @vitest-environment jsdom
 *
 * The Success Plan inputs follow the KPI cards' order (#2297, Ron
 * 2026-10-28): Paid Clubs → Club Growth, Membership Payments → Membership
 * Payments Growth, Distinguished Clubs → Distinguished Clubs.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { DistrictKpiStrip } from '../DistrictKpiStrip'
import { SuccessPlanTargetsPanel } from '../SuccessPlanTargetsPanel'
import { getProgramYear } from '../../utils/programYear'
import type { MetricRankings, RecognitionTargets } from '../../types/districts'

const rankings: MetricRankings = {
  worldRank: 30,
  worldPercentile: 77,
  regionRank: 3,
  totalDistricts: 128,
  totalInRegion: 11,
  region: '05',
}
const targets: RecognitionTargets = {
  distinguished: 158,
  select: 161,
  presidents: 164,
  smedley: 169,
}
const kpis = {
  paidClubs: { current: 149, targets, rankings },
  membershipPayments: { current: 160, targets, rankings },
  distinguishedClubs: { current: 84, targets, rankings },
  netMemberChange: { current: 312 },
}

/** Which DSP goal area each tiered card measures. */
const GOAL_AREA_FOR_CARD: Record<string, string> = {
  'Paid Clubs': 'Club Growth',
  'Membership Payments': 'Membership Payments Growth',
  'Distinguished Clubs': 'Distinguished Clubs',
}

afterEach(() => cleanup())

describe('Success Plan input order (#2297)', () => {
  it('lists the goal areas in the same order as the KPI cards', () => {
    window.sessionStorage.clear()
    render(
      <MemoryRouter>
        <DistrictKpiStrip kpis={kpis} />
      </MemoryRouter>
    )
    const cardTitles = screen
      .getAllByTestId('kpi-bullet-card')
      .map(c => c.querySelector('h3')?.textContent ?? '')
    cleanup()

    render(
      <SuccessPlanTargetsPanel
        programYear={getProgramYear(2026)}
        targets={null}
        onChange={() => {}}
      />
    )
    fireEvent.click(screen.getByText('Success Plan targets'))
    const inputLabels = screen
      .getAllByRole('textbox')
      .map(i => (i as HTMLInputElement).labels?.[0]?.textContent ?? '')

    expect(cardTitles).toEqual([
      'Paid Clubs',
      'Membership Payments',
      'Distinguished Clubs',
    ])
    expect(inputLabels).toEqual(cardTitles.map(t => GOAL_AREA_FOR_CARD[t]))
  })
})
