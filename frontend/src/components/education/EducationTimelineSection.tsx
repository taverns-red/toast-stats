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
     path; the section reserves the chart's height (`edu-tl-section--reserved`)
     while the file and the chunk load, and the "not available" state holds
     the same height, so nothing below moves (CLS).
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
}

const Skeleton: React.FC = () => (
  <div
    className="edu-tl__skeleton"
    role="status"
    aria-label="Loading the awards timeline"
  >
    <div className="edu-tl__skeleton-line" />
    <div className="edu-tl__skeleton-plot" />
    <span className="sr-only">Loading the awards timeline…</span>
  </div>
)

export const EducationTimelineSection: React.FC<
  EducationTimelineSectionProps
> = ({ programYear, kind, id, through, tilesTotal, tilesAsOf, summary }) => {
  const [params] = useSearchParams()
  const mode: 'level' | 'path' = params.get('by') === 'path' ? 'path' : 'level'
  const { timeline, isLoading } = useEducationTimeline(programYear, kind, id)

  return (
    <section
      className={`education-section edu-tl-section edu-tl-section--reserved${mode === 'path' ? ' edu-tl-section--path' : ''}`}
      aria-label="Awards over time"
    >
      <h2 className="education-section__title">
        Awards over time, by {mode === 'path' ? 'path' : 'level'}
      </h2>
      {isLoading ? (
        <Skeleton />
      ) : timeline ? (
        <Suspense fallback={<Skeleton />}>
          <EducationTimelineChart
            timeline={timeline}
            mode={mode}
            through={through ?? undefined}
            tilesTotal={tilesTotal}
            tilesAsOf={tilesAsOf}
            notes={<ProgramNotes e={summary} />}
          />
        </Suspense>
      ) : (
        <div className="edu-tl__unavailable">
          <p
            role="status"
            className="education-empty"
            data-testid="education-timeline-unavailable"
          >
            The awards timeline for {programYear} is not available yet. It is
            built from the daily education reports, so this is not zero awards.
            The figures on this page are unaffected.
          </p>
          <ProgramBar e={summary} />
        </div>
      )}
    </section>
  )
}

export default EducationTimelineSection
