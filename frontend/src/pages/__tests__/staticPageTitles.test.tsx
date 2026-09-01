/* Per-route document titles for the static content pages (#780, epic #785).
   Methodology and History have no async data, so their title is deterministic
   on mount — the simplest end of the per-route title contract (F-SA3). */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MethodologyPage from '../MethodologyPage'
import HistoryPage from '../HistoryPage'
import McpPage from '../McpPage'

// HistoryPage fetches per-year cards (#892); the title is still synchronous on
// mount, so stub the data hook to keep this title test network-free.
vi.mock('../../hooks/useProgramYearSummaries', () => ({
  useProgramYearSummaries: () => ({
    summaries: [],
    isLoading: false,
    isError: false,
    error: null,
  }),
}))

// The page also mounts the worldwide scoreboard (#1500). Stub its queries so
// the scaffold assertions stay synchronous and network-free; the
// artifact-absent state keeps the year strip the page's only role="list".
vi.mock('../../hooks/useGlobalHistory', () => ({
  useGlobalHistory: () => ({ history: null, isLoading: false, isError: false }),
  useGlobalClubsByCountry: () => ({
    clubsByCountry: null,
    clubsCounted: null,
    snapshotDate: null,
    isLoading: false,
    isError: false,
  }),
}))

afterEach(() => cleanup())

describe('static page document titles (#780)', () => {
  it('titles the Methodology page', async () => {
    render(
      <MemoryRouter>
        <MethodologyPage />
      </MemoryRouter>
    )
    await waitFor(() =>
      expect(document.title).toBe('Methodology — Toast Stats')
    )
  })

  it('titles the History page', async () => {
    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    )
    await waitFor(() =>
      expect(document.title).toBe('Program Year History — Toast Stats')
    )
  })

  it('titles the MCP Server page (#1165)', async () => {
    render(
      <MemoryRouter>
        <McpPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(document.title).toBe('MCP Server — Toast Stats'))
  })
})
