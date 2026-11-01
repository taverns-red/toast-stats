import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type {
  ClubDistrictHistoryClub,
  ClubDistrictHistoryShard,
} from '@taverns-red/shared-contracts'

/* #2427 — the "Before this district existed" panel. Real-shape fixtures
   (prod CDN, 2026-11-01): a history shard keyed by canonical club id, the
   snapshot index's `{ districtId: dates[] }`, and a year-end snapshot
   envelope `{ status, data: { clubs } }`. */

const near = vi.hoisted(() => ({ value: true }))
vi.mock('../../hooks/useNearViewport', () => ({
  useNearViewport: () => near.value,
}))

const fetchShard = vi.hoisted(() => vi.fn())
vi.mock('../../services/cdnClubDistrictHistory', () => ({
  fetchClubDistrictHistoryShard: fetchShard,
}))

const cdn = vi.hoisted(() => ({
  fetchCdnSnapshotIndex: vi.fn(),
  fetchCdnDistrictSnapshot: vi.fn(),
}))
vi.mock('../../services/cdn', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/cdn')>()),
  ...cdn,
}))

import { PredecessorHistoryPanel } from '../PredecessorHistoryPanel'

const PRIOR = '2025-2026'

function entry(byProgramYear: Record<string, string>): ClubDistrictHistoryClub {
  return {
    name: 'A club',
    formerNames: [],
    firstSeen: '2016-07-31',
    lastSeen: '2026-10-31',
    spans: [{ from: '2016-07-31', to: null, districtId: '1' }],
    byProgramYear,
  } as ClubDistrictHistoryClub
}

/** Every club the tests use, by canonical id. */
const HISTORY: Record<string, ClubDistrictHistoryClub> = {
  '977': entry({ [PRIOR]: '01', '2026-2027': '201' }),
  '21': entry({ [PRIOR]: '01', '2026-2027': '201' }),
  '5011': entry({ [PRIOR]: '52', '2026-2027': '201' }),
  '9001': entry({ '2026-2027': '201' }),
  '6101': entry({ [PRIOR]: '61', '2026-2027': '61' }),
}

function shardFor(key: string): ClubDistrictHistoryShard {
  const clubs = Object.fromEntries(
    Object.entries(HISTORY).filter(([id]) => id.padStart(2, '0').endsWith(key))
  )
  return { shard: key, clubs } as unknown as ClubDistrictHistoryShard
}

const yearEndClub = (clubId: string, over: Record<string, unknown> = {}) => ({
  clubId,
  clubName: `Club ${clubId}`,
  divisionId: 'A',
  areaId: '01',
  membershipCount: 20,
  paymentsCount: 42,
  dcpGoals: 9,
  status: 'Active',
  divisionName: 'Division A',
  areaName: 'Area 01',
  octoberRenewals: 18,
  aprilRenewals: 18,
  membershipBase: 20,
  clubStatus: 'Active',
  distinguishedStatus: 'P',
  ...over,
})

const SNAPSHOTS: Record<string, unknown> = {
  '01': {
    status: 'success',
    data: {
      clubs: [
        yearEndClub('977'),
        yearEndClub('00000021', {
          membershipCount: 12,
          membershipBase: 18,
          dcpGoals: 3,
          distinguishedStatus: '',
        }),
      ],
    },
  },
  '52': {
    status: 'success',
    data: {
      clubs: [yearEndClub('5011', { distinguishedStatus: 'S', dcpGoals: 7 })],
    },
  },
}

beforeEach(() => {
  near.value = true
  fetchShard.mockReset().mockImplementation(async (k: string) => shardFor(k))
  cdn.fetchCdnSnapshotIndex.mockReset().mockResolvedValue({
    '01': ['2026-06-29', '2026-06-30', '2026-07-30'],
    '52': ['2026-06-30'],
    // The orphan 2026-06-30 entry (#2439) must never make D201 look old.
    '201': ['2026-06-30', '2026-10-31'],
  })
  cdn.fetchCdnDistrictSnapshot
    .mockReset()
    .mockImplementation(async (_date: string, d: string) => {
      const snap = SNAPSHOTS[d]
      if (!snap) throw new Error(`CDN fetch failed: 404 for ${d}`)
      return snap
    })
})

function renderPanel(districtId: string, clubIds: string[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const clubs = clubIds.map((clubId, i) => ({
    clubId,
    // The first club is the oldest charter: it is the gate's probe.
    charterDate: `19${50 + i}-01-01`,
  }))
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PredecessorHistoryPanel
          districtId={districtId}
          programYear="2026-2027"
          clubs={clubs}
        />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const D201_ROSTER = ['00000977', '21', '5011', '9001']

describe('PredecessorHistoryPanel (#2427)', () => {
  it('offers the panel collapsed for a new district, reading one shard only', async () => {
    renderPanel('201', D201_ROSTER)
    const toggle = await screen.findByRole('button', {
      name: /before this district existed/i,
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // Only the probe club's shard; no year-end snapshot, no index.
    expect(fetchShard).toHaveBeenCalledTimes(1)
    expect(fetchShard).toHaveBeenCalledWith('77')
    expect(cdn.fetchCdnDistrictSnapshot).not.toHaveBeenCalled()
    expect(cdn.fetchCdnSnapshotIndex).not.toHaveBeenCalled()
  })

  it('fetches nothing until it is near the viewport', async () => {
    near.value = false
    renderPanel('201', D201_ROSTER)
    await new Promise(r => setTimeout(r, 20))
    expect(fetchShard).not.toHaveBeenCalled()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('keeps its gate marker out of the flow, so it adds no space-y gap', async () => {
    /* The Overview stack is a space-y container: any in-flow child, even
       an empty one, adds a 16–24px gap. At 375 the page has ~12px of
       headroom (PAGE_MAX_H), so the marker must take no space at all. */
    near.value = false
    const { container } = renderPanel('61', ['6101'])
    const slot = container.querySelector('.predecessor-history-slot')
    expect(slot).not.toBeNull()
    const css = readFileSync(
      resolve(__dirname, '../../styles/components/predecessor-history.css'),
      'utf8'
    )
    expect(css).toMatch(
      /\.predecessor-history-slot\s*\{[^}]*position:\s*absolute/
    )
  })

  it('renders nothing for a district that already existed last year', async () => {
    renderPanel('61', ['6101', '977'])
    await waitFor(() => expect(fetchShard).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 20))
    expect(screen.queryByText(/before this district existed/i)).toBeNull()
  })

  it('on expand, shows aggregates grouped by former district and new charters', async () => {
    renderPanel('201', D201_ROSTER)
    await userEvent.click(
      await screen.findByRole('button', {
        name: /before this district existed/i,
      })
    )
    const d01 = await screen.findByTestId('predecessor-01')
    expect(within(d01).getByText('District 01')).toBeInTheDocument()
    expect(d01).toHaveTextContent('2 clubs')
    // 20 + 12 members at year end, against a base of 20 + 18.
    expect(d01).toHaveTextContent('32 members')
    expect(d01).toHaveTextContent('−6')
    expect(d01).toHaveTextContent("1 club (1 President's)")
    expect(d01).toHaveTextContent('6 DCP goals')

    const d52 = screen.getByTestId('predecessor-52')
    expect(d52).toHaveTextContent('1 club')
    expect(d52).toHaveTextContent('1 club (1 Select)')

    expect(
      screen.getByText(/1 club has no 2025-2026 record/i)
    ).toBeInTheDocument()
    // Labelled as the clubs' history, not the district's.
    expect(
      screen.getByText(/current clubs under their former districts/i)
    ).toBeInTheDocument()
    // Each predecessor's year-end, from the shared index lookup.
    expect(cdn.fetchCdnDistrictSnapshot).toHaveBeenCalledWith(
      '2026-06-30',
      '01'
    )
    expect(cdn.fetchCdnDistrictSnapshot).toHaveBeenCalledWith(
      '2026-06-30',
      '52'
    )
    expect(cdn.fetchCdnDistrictSnapshot).toHaveBeenCalledTimes(2)
  })

  it('withdraws the panel when the full roster shows the district is not new', async () => {
    // The probe (oldest club) was in D01, but another current club was
    // already in D201 last year: the district has prior-year data.
    HISTORY['4401'] = entry({ [PRIOR]: '201', '2026-2027': '201' })
    try {
      renderPanel('201', ['977', '4401'])
      await userEvent.click(
        await screen.findByRole('button', {
          name: /before this district existed/i,
        })
      )
      await waitFor(() =>
        expect(screen.queryByText(/before this district existed/i)).toBeNull()
      )
      expect(cdn.fetchCdnDistrictSnapshot).not.toHaveBeenCalled()
    } finally {
      delete HISTORY['4401']
    }
  })
})
