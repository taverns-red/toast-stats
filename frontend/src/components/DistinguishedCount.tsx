import React from 'react'

/* The one place a Distinguished-club count is drawn (#2554, epic #2555).

   Confirmed is the headline; the rest follows as "+N qualifying today" (Ron's
   D5, 2026-11-12; the pipeline still calls it provisional) and is
   never added in. Every surface that shows the count goes through this, so
   they cannot drift apart again. Plain spans only (no block elements, no
   focus stop), so it sits inside a <p>, a <div> or a tile <button> without
   adding a tap target or a row.

   `provisional` absent or 0 draws the confirmed count alone, which is the
   landing KPI today (rankings carry no provisional figure). Legacy palette:
   the provisional part is the muted ink, never colour alone. */

export const PROVISIONAL_TOOLTIP =
  'Qualifying today: clubs that qualify on current membership but whose April renewals do not yet confirm the level. Not counted in the confirmed total or in the rank.'

/** The same explanation as the tooltip, in the text itself (no digits, so it
 *  never reads as a second count). */
export const PROVISIONAL_NOTE = 'not yet confirmed by April renewals'

/** Visible one-line key to the confirmed / qualifying-today pair (#2580). */
export const DistinguishedBasisNote: React.FC<{ className?: string }> = ({
  className,
}) => (
  <p
    id="distinguished-basis-note"
    data-testid="distinguished-basis-note"
    className={className}
  >
    Distinguished clubs: the headline is confirmed by April renewals, and rank
    and % use it. &quot;+N qualifying today&quot; counts clubs that meet a level
    on current membership but are not yet confirmed; it is never added in.
  </p>
)

/** The "+N qualifying today" extra beside a confirmed count: nothing when N is
 *  0 or unknown. Shared by every surface that draws the pair itself (#2580). */
export const QualifyingTodayExtra: React.FC<{
  provisional?: number | null | undefined
  stacked?: boolean | undefined
}> = ({ provisional, stacked = false }) =>
  provisional != null && provisional > 0 ? (
    <>
      {' '}
      <span
        data-testid="distinguished-provisional"
        className={
          stacked
            ? 'distinguished-count__provisional distinguished-count__provisional--stacked'
            : 'distinguished-count__provisional'
        }
        title={PROVISIONAL_TOOLTIP}
      >
        +{provisional.toLocaleString()} qualifying today
        {/* `title` does not reach touch or most screen readers (#2580). */}
        <span data-testid="distinguished-provisional-note" className="sr-only">
          {' '}
          {PROVISIONAL_NOTE}
        </span>
      </span>
    </>
  ) : null

/** A fixed-size placeholder for a value the published counts decide while they
 *  load (#2580): nothing is drawn on the qualifying-today basis first and then
 *  flipped. Sized to the real content so its arrival moves nothing; not read
 *  out (the page is loading). Same pulse as the list skeletons. */
export const CountPending: React.FC<{
  width: string
  height: string
  className?: string
}> = ({ width, height, className }) => (
  <span
    data-testid="distinguished-pending"
    aria-hidden="true"
    className={`animate-pulse bg-gray-200 rounded-sm inline-block align-middle ${className ?? ''}`}
    style={{ width, height }}
  />
)

export interface DistinguishedCountProps {
  confirmed: number
  provisional?: number | null | undefined
  /** `qualifying-today` when no confirmed source exists (#2580). */
  basis?: 'confirmed' | 'qualifying-today' | undefined
  /** Compact phone table (#2580): the extra sits on its own line under the
   *  confirmed count, at the 14px data size rather than the desktop 12px. */
  stacked?: boolean | undefined
}

export const DistinguishedCount: React.FC<DistinguishedCountProps> = ({
  confirmed,
  provisional,
  basis = 'confirmed',
  stacked = false,
}) => (
  <>
    <span
      data-testid="distinguished-confirmed"
      className="distinguished-count__confirmed"
    >
      {confirmed.toLocaleString()}
    </span>
    {basis === 'qualifying-today' && (
      <>
        {' '}
        {/* No confirmed source exists, so this is clubs qualifying today. Say
            so beside a rank that is on the confirmed basis (#2580). */}
        <span
          data-testid="distinguished-basis"
          className="distinguished-count__provisional"
        >
          qualifying today
        </span>
      </>
    )}
    {basis === 'confirmed' && (
      <QualifyingTodayExtra provisional={provisional} stacked={stacked} />
    )}
  </>
)
