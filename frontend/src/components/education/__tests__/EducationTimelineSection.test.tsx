/* #2592 — the section that sits under the KPI tiles on the three Education
   pages: it reads the page's own program year (R3), reserves the chart's
   height while loading, and says "not available yet" -- never a zero line,
   never an error -- when the artifact is absent. */

import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { EducationTimelineSection } from '../EducationTimelineSection'
import type { EducationSummary } from '../../../utils/districtEducation'
import {
  DISTRICT_61_TIMELINE,
  WORLD_TIMELINE,
} from '../../../__tests__/fixtures/educationTimelineFixtures'
import * as hook from '../../../hooks/useEducationTimeline'

vi.mock('../../../hooks/useEducationTimeline', () => ({
  useEducationTimeline: vi.fn(),
}))
vi.mock('recharts', () => ({
  ComposedChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart">{children}</div>
  ),
  Area: ({ dataKey }: { dataKey: string }) => (
    <div data-testid="area" data-key={dataKey} />
  ),
  Line: () => <div data-testid="line" />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

const useTimeline = vi.mocked(hook.useEducationTimeline)

const summary: EducationSummary = {
  totals: { awards: 71, pathways: 66, legacy: 2, dtm: 3, other: 0 },
  levels: [],
  paths: [],
  levelTotals: [34, 16, 9, 5, 2],
  legacyByCode: [{ code: 'CC', count: 2 }],
  otherByCode: [],
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  useTimeline.mockReset()
})

const renderSection = (
  props: Partial<React.ComponentProps<typeof EducationTimelineSection>> = {},
  url = '/district/61/education'
) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <EducationTimelineSection
        programYear="2026-2027"
        kind="district"
        id="61"
        through="2026-10-11"
        tilesTotal={71}
        tilesAsOf="2026-10-11"
        summary={summary}
        {...props}
      />
    </MemoryRouter>
  )

describe('EducationTimelineSection', () => {
  it('reads the timeline for the PY, entity and id the page passes (R3)', () => {
    useTimeline.mockReturnValue({ timeline: null, isLoading: true })
    renderSection({ programYear: '2025-2026', kind: 'region', id: '09' })
    expect(useTimeline).toHaveBeenCalledWith('2025-2026', 'region', '09')
  })

  it('reserves the chart height while loading (no layout shift)', () => {
    useTimeline.mockReturnValue({ timeline: null, isLoading: true })
    const { container } = renderSection()
    expect(screen.getByRole('status', { name: /loading/i })).toBeVisible()
    expect(container.querySelector('.edu-tl-section--reserved')).not.toBeNull()
  })

  it('renders the chart once the file is there', async () => {
    useTimeline.mockReturnValue({
      timeline: DISTRICT_61_TIMELINE,
      isLoading: false,
    })
    renderSection()
    expect(await screen.findByTestId('chart')).toBeInTheDocument()
    expect(screen.getByTestId('line')).toBeInTheDocument()
  })

  it('works for a world file (aggregate points)', async () => {
    useTimeline.mockReturnValue({ timeline: WORLD_TIMELINE, isLoading: false })
    renderSection({ kind: 'world', id: null })
    expect(await screen.findByTestId('chart')).toBeInTheDocument()
  })

  it('groups by path when the page toggle says ?by=path', async () => {
    useTimeline.mockReturnValue({
      timeline: DISTRICT_61_TIMELINE,
      isLoading: false,
    })
    renderSection({}, '/district/61/education?by=path')
    await screen.findByTestId('chart')
    expect(
      screen.getAllByTestId('area').map(a => a.getAttribute('data-key'))
    ).toContain('rest')
  })

  describe('when the file is absent', () => {
    beforeEach(() => {
      useTimeline.mockReturnValue({ timeline: null, isLoading: false })
    })

    it('says so honestly: not available yet, not zero, not an error', () => {
      renderSection()
      const note = screen.getByTestId('education-timeline-unavailable')
      expect(note).toHaveTextContent(/not available yet/i)
      expect(note).toHaveTextContent('2026-2027')
      expect(screen.queryByTestId('chart')).toBeNull()
      expect(screen.queryByTestId('line')).toBeNull()
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('keeps the old program bar legend so the page loses nothing', () => {
      renderSection()
      const legend = screen.getByRole('list', { name: 'Awards by program' })
      expect(within(legend).getByText('Pathways')).toBeVisible()
      expect(within(legend).getByText('Legacy')).toBeVisible()
    })

    it('holds the same reserved height as the chart', () => {
      const { container } = renderSection()
      expect(
        container.querySelector('.edu-tl-section--reserved')
      ).not.toBeNull()
    })
  })
})
