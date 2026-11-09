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
  Line: ({ dataKey }: { dataKey: string }) => (
    <div data-testid="line" data-key={dataKey} />
  ),
  ReferenceLine: () => <div data-testid="reference-line" />,
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
    useTimeline.mockReturnValue({
      timeline: null,
      isLoading: true,
      listed: true,
    })
    renderSection({ programYear: '2025-2026', kind: 'region', id: '09' })
    expect(useTimeline).toHaveBeenCalledWith('2025-2026', 'region', '09')
  })

  it('reserves the chart height while loading (no layout shift)', () => {
    useTimeline.mockReturnValue({
      timeline: null,
      isLoading: true,
      listed: true,
    })
    const { container } = renderSection()
    expect(screen.getByRole('status', { name: /loading/i })).toBeVisible()
    expect(container.querySelector('.edu-tl-section--reserved')).not.toBeNull()
  })

  it('renders the chart once the file is there', async () => {
    useTimeline.mockReturnValue({
      timeline: DISTRICT_61_TIMELINE,
      isLoading: false,
      listed: true,
    })
    renderSection()
    expect(await screen.findByTestId('chart')).toBeInTheDocument()
    expect(
      screen
        .getAllByTestId('line')
        .some(l => l.getAttribute('data-key') === 'ghost')
    ).toBe(true)
  })

  it('works for a world file (aggregate points)', async () => {
    useTimeline.mockReturnValue({
      timeline: WORLD_TIMELINE,
      isLoading: false,
      listed: true,
    })
    renderSection({ kind: 'world', id: null })
    expect(await screen.findByTestId('chart')).toBeInTheDocument()
  })

  it('groups by path when the page toggle says ?by=path', async () => {
    useTimeline.mockReturnValue({
      timeline: DISTRICT_61_TIMELINE,
      isLoading: false,
      listed: true,
    })
    const { container } = renderSection({}, '/district/61/education?by=path')
    await screen.findByTestId('chart')
    // The path legend wraps taller on a phone, so it reserves more.
    expect(container.querySelector('.edu-tl-section--path')).not.toBeNull()
    expect(
      screen.getAllByTestId('area').map(a => a.getAttribute('data-key'))
    ).toContain('rest')
  })

  describe('when the file is absent', () => {
    beforeEach(() => {
      useTimeline.mockReturnValue({
        timeline: null,
        isLoading: false,
        listed: true,
      })
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

    it('collapses to a compact note once the load fails: no blank block', () => {
      const { container } = renderSection()
      expect(container.querySelector('.edu-tl-section--reserved')).toBeNull()
    })
  })

  describe('when the index has no timeline row for the PY (no fetch)', () => {
    beforeEach(() => {
      useTimeline.mockReturnValue({
        timeline: null,
        isLoading: false,
        listed: false,
      })
    })

    it('is a compact not-available state: no reserved height', () => {
      const { container } = renderSection()
      expect(
        screen.getByTestId('education-timeline-unavailable')
      ).toHaveTextContent(/not available yet/i)
      expect(container.querySelector('.edu-tl-section--reserved')).toBeNull()
      expect(screen.queryByTestId('chart')).toBeNull()
    })

    it('still shows the program bar legend', () => {
      renderSection()
      expect(
        screen.getByRole('list', { name: 'Awards by program' })
      ).toBeVisible()
    })
  })

  describe('when the selected date is before the first point', () => {
    it('is not available for this date, keeps the bar, and is not blank', () => {
      useTimeline.mockReturnValue({
        timeline: DISTRICT_61_TIMELINE,
        isLoading: false,
        listed: true,
      })
      const { container } = renderSection({ through: '2026-01-01' })
      const note = screen.getByTestId('education-timeline-unavailable')
      expect(note).toHaveTextContent(/not available for this date/i)
      expect(screen.queryByTestId('chart')).toBeNull()
      expect(
        screen.getByRole('list', { name: 'Awards by program' })
      ).toBeVisible()
      expect(container.querySelector('.edu-tl-section--reserved')).toBeNull()
    })

    it('is the same for a file with no points at all', () => {
      useTimeline.mockReturnValue({
        timeline: { ...DISTRICT_61_TIMELINE, points: [] },
        isLoading: false,
        listed: true,
      })
      renderSection({ through: undefined })
      expect(screen.getByTestId('education-timeline-unavailable')).toBeVisible()
      expect(screen.queryByTestId('chart')).toBeNull()
    })
  })

  describe('program notes', () => {
    it('are on the page while the chart loads, outside the reserved block', () => {
      useTimeline.mockReturnValue({
        timeline: null,
        isLoading: true,
        listed: true,
      })
      const { container } = renderSection({
        summary: { ...summary, legacyByCode: [{ code: 'CC', count: 2 }] },
      })
      const notes = screen.getByText(/Legacy awards by code: CC 2/)
      expect(notes).toBeVisible()
      expect(notes.closest('.edu-tl-section__block')).toBeNull()
      expect(container.querySelector('.edu-tl-section__block')).not.toBeNull()
    })
  })
})
