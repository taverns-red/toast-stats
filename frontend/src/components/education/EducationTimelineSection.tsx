import React, { Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { EducationTimelineEntityKind } from '@taverns-red/shared-contracts'
import type { EducationSummary } from '../../utils/districtEducation'
import { useEducationTimeline } from '../../hooks/useEducationTimeline'
import { ProgramBar, ProgramNotes } from './EducationBreakdown'

/* #2592 (epic #2590) — "Awards over time", directly under the KPI tiles on
   the District, Region and World Education pages. It replaces the single
   Pathways / Legacy / DTM bar: the chart's legend carries that bar's names
   and values.

   - The page passes its own program year (R3), entity and, for the district
     page, its selected date; this never reads them out of the response.
   - The chart is a lazy chunk so Recharts stays off the page's critical
     path. While the file and the chunk load, the skeleton draws the loaded
     chart's own boxes (fixed heights, plus line-count slots for the legend
     and note; education-timeline.css), so nothing below moves (CLS). Only a
     PY the index lists reserves anything: with no row the state is compact.
   - The file may be absent even when the rollup index names the program
     year (a first PY whose set promotion refused, or before the backfill).
     Absent, 404 and schema drift all read "not available yet" -- never a
     zero line, never an error -- and the old program bar stays, so the page
     loses nothing.
   - By level / By path is the page's existing `?by=` toggle (ADR-005: URL
     state, no tabs); the chart follows it. */

const EducationTimelineChart = React.lazy(
  () => import('./EducationTimelineChart')
)

export interface EducationTimelineSectionProps {
  /** The page's selected PY label (R3), e.g. `2026-2027`. */
  programYear: string
  kind: EducationTimelineEntityKind
  id: string | null
  /** The page's selected date, when it has one (the district page). */
  through?: string | null | undefined
  /** The KPI tiles' awards figure and the date they are as of. */
  tilesTotal: number
  tilesAsOf: string | null
  /** The program breakdown: the bar's legend, kept when there is no chart. */
  summary: EducationSummary
  /** Heading level of the section title; 2 on pages whose h1 has no h2 above. */
  headingLevel?: 2 | 3
}

const Skeleton: React.FC = () => (
  <div
    className="edu-tl__skeleton"
    role="status"
    aria-label="Loading the awards timeline"
  >
    <div className="edu-tl__skeleton-line" />
    <div className="edu-tl__skeleton-plot" />
    {/* The loaded chart's variable-height parts, as empty slots of the same
        size: the legend and the note wrap per font, so each reserves a fixed
        number of lines (education-timeline.css), here and in the chart. */}
    <div className="edu-tl__skeleton-readout" />
    <div className="edu-tl__skeleton-legend" />
    <div className="edu-tl__skeleton-note" />
    <div className="edu-tl__skeleton-toggle" />
    <span className="sr-only">Loading the awards timeline…</span>
  </div>
)

export const EducationTimelineSection: React.FC<
  EducationTimelineSectionProps
> = ({
  programYear,
  kind,
  id,
  through,
  tilesTotal,
  tilesAsOf,
  summary,
  headingLevel = 3,
}) => {
  const Heading = `h${headingLevel}` as 'h2' | 'h3'
  const [params] = useSearchParams()
  const mode: 'level' | 'path' = params.get('by') === 'path' ? 'path' : 'level'
  const { timeline, isLoading } = useEducationTimeline(programYear, kind, id)

  // The selected date can sit before the file's first point (or the file can
  // hold none): zero rows is "not available for this date", never a blank.
  const hasRows =
    !!timeline && timeline.points.some(p => !through || p.date <= through)
  const chartTimeline = !isLoading && hasRows ? timeline : null
  // Height is reserved only while there is, or is about to be, a chart.
  const reserved = isLoading || chartTimeline !== null

  return (
    <section
      className="education-section edu-tl-section"
      aria-label="Awards over time"
    >
      <div
        className={`edu-tl-section__block${reserved ? ' edu-tl-section--reserved' : ''}${reserved && mode === 'path' ? ' edu-tl-section--path' : ''}`}
      >
        <Heading className="education-section__title">
          Awards over time, by {mode === 'path' ? 'path' : 'level'}
        </Heading>
        {isLoading ? (
          <Skeleton />
        ) : chartTimeline ? (
          <Suspense fallback={<Skeleton />}>
            <EducationTimelineChart
              timeline={chartTimeline}
              mode={mode}
              through={through ?? undefined}
              tilesTotal={tilesTotal}
              tilesAsOf={tilesAsOf}
            />
          </Suspense>
        ) : (
          <div className="edu-tl__unavailable">
            <p
              role="status"
              className="education-empty"
              data-testid="education-timeline-unavailable"
            >
              {timeline
                ? 'The awards timeline is not available for this date: it starts after the date selected. '
                : `The awards timeline for ${programYear} is not available yet. It is built from the daily education reports, so this is not zero awards. `}
              The figures on this page are unaffected.
            </p>
            <ProgramBar e={summary} />
          </div>
        )}
      </div>
      {/* Known without the file, so it is on the page from the first paint
          and never changes the height of the reserved block above. The
          program bar of the unavailable state carries its own copy. */}
      {reserved && <ProgramNotes e={summary} />}
    </section>
  )
}

export default EducationTimelineSection
