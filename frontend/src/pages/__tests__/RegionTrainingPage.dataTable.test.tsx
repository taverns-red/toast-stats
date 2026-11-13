/**
 * Region training table on the shared DataTable (#2733, #2676, spec §14 M6).
 *
 * Sort only. The old two-row header (a "Round 1" group over "4+" and "All 7")
 * is one row now, so every column names itself and every header is a
 * `scope="col"` cell.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@testing-library/jest-dom'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import RegionTrainingPage from '../RegionTrainingPage'
import { fetchCdnRegionRollups } from '../../services/cdn'
import recorded from '../../__tests__/fixtures/region-rollups-2026-10-15.recorded.json'
import { RegionRollupsSchema } from '@taverns-red/shared-contracts'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({ dates: ['2026-10-15'], count: 1 }),
  fetchCdnRegionRollups: vi.fn(),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2026-10-15'),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-10-15', generatedAt: 'x' }),
}))

const mocked = vi.mocked(fetchCdnRegionRollups)

function withTraining() {
  const r = structuredClone(RegionRollupsSchema.parse(recorded))
  for (const id of ['123', '216', '31', '53', '60', '61', '86'])
    r.districts[id]!.officerTraining = {
      round1: [6, 0, 0, 0, 3, 0, 0, 1],
      round2: [10, 0, 0, 0, 0, 0, 0, 0],
    }
  return r
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ProgramYearProvider>
        <MemoryRouter initialEntries={['/region/05/training']}>
          <Routes>
            <Route
              path="/region/:n/training"
              element={<RegionTrainingPage />}
            />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

describe('RegionTrainingPage table on the DataTable (#2733)', () => {
  it('is a DataTable with a caption that says what and how many', async () => {
    mocked.mockResolvedValue(withTraining())
    renderPage()
    const table = await screen.findByTestId('region-training-table')
    expect(table).toHaveClass('dt')
    expect(table.querySelector('caption')?.textContent).toMatch(
      /region 05.*7 districts/i
    )
  })

  it('has one header row of scope=col headers, and a district row header', async () => {
    mocked.mockResolvedValue(withTraining())
    renderPage()
    const table = await screen.findByTestId('region-training-table')
    expect(table.querySelectorAll('thead tr')).toHaveLength(1)
    for (const th of table.querySelectorAll('thead th'))
      expect(th).toHaveAttribute('scope', 'col')
    const rowHeader = table.querySelector('tbody th')!
    expect(rowHeader).toHaveAttribute('scope', 'row')
    expect(within(rowHeader as HTMLElement).getByRole('link')).toBeVisible()
  })

  it('names the round in every figure column header', async () => {
    mocked.mockResolvedValue(withTraining())
    renderPage()
    const table = await screen.findByTestId('region-training-table')
    const figureHeaders = within(table)
      .getAllByRole('columnheader')
      .slice(2)
      .map(th => th.textContent ?? '')
    expect(figureHeaders).toHaveLength(4)
    for (const text of figureHeaders) expect(text).toMatch(/^Round [12]/)
  })

  it('keeps each header part whole: the months and opening date are nowrap parts (#2318)', async () => {
    mocked.mockResolvedValue(withTraining())
    renderPage()
    const table = await screen.findByTestId('region-training-table')
    const headers = within(table)
      .getAllByRole('columnheader')
      .filter(th => /^Round/.test(th.textContent ?? ''))
    expect(headers).toHaveLength(4)
    for (const th of headers) {
      const parts = Array.from(
        th.querySelectorAll('.region-training-table__round-part')
      ).map(p => p.textContent)
      expect(parts[0]).toMatch(/^Round [12]$/)
      expect(parts[1]).toMatch(/^\([A-Z][a-z]{2}–[A-Z][a-z]{2}\)$/)
    }
    expect(headers[2]!.textContent).toMatch(/opens Nov 1/)
    expect(
      headers[2]!.querySelectorAll('.region-training-table__round-part')
    ).toHaveLength(3)
    // The accessible name still reads as plain words.
    expect(
      within(table).getAllByRole('button', {
        name: /^Round 1 \(Jun–Aug\): 4\+$/,
      })
    ).toHaveLength(1)
  })

  it('styles the round part as nowrap', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const css = readFileSync(
      join(__dirname, '../../styles/components/training.css'),
      'utf-8'
    )
    expect(css).toMatch(
      /\.region-training-table__round-part\s*\{[^}]*white-space:\s*nowrap/
    )
  })

  it('hides no column with CSS and sets no text below the 14px floor', async () => {
    mocked.mockResolvedValue(withTraining())
    renderPage()
    const table = await screen.findByTestId('region-training-table')
    expect(table.innerHTML).not.toMatch(
      /class="(?:[^"]*\s)?(?:[a-z]+:)?(?:hidden|table-cell)(?:\s[^"]*)?"|__col--/
    )
    expect(table.innerHTML).not.toMatch(/\btext-(?:xs|\[(?:9|1[0-3])px\])/)
  })
})
