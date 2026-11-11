import React from 'react'

/* The one place a Distinguished-club count is drawn (#2554, epic #2555).

   Confirmed is the headline; provisional follows as "+N provisional" and is
   never added in. Every surface that shows the count goes through this, so
   they cannot drift apart again. Plain spans only (no block elements, no
   focus stop), so it sits inside a <p>, a <div> or a tile <button> without
   adding a tap target or a row.

   `provisional` absent or 0 draws the confirmed count alone, which is the
   landing KPI today (rankings carry no provisional figure). Legacy palette:
   the provisional part is the muted ink, never colour alone. */

export const PROVISIONAL_TOOLTIP =
  'Provisional: clubs that qualify on current membership but whose April renewals do not yet confirm the level. Not counted in the confirmed total or in the rank.'

/** The same explanation as the tooltip, in the text itself (no digits, so it
 *  never reads as a second count). */
export const PROVISIONAL_NOTE = 'clubs qualifying today, not yet confirmed'

export interface DistinguishedCountProps {
  confirmed: number
  provisional?: number | null | undefined
  /** `qualifying-today` when no confirmed source exists (#2580). */
  basis?: 'confirmed' | 'qualifying-today' | undefined
}

export const DistinguishedCount: React.FC<DistinguishedCountProps> = ({
  confirmed,
  provisional,
  basis = 'confirmed',
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
    {basis === 'confirmed' && provisional != null && provisional > 0 && (
      <>
        {' '}
        <span
          data-testid="distinguished-provisional"
          className="distinguished-count__provisional"
          title={PROVISIONAL_TOOLTIP}
        >
          +{provisional.toLocaleString()} provisional
          {/* `title` does not reach touch or most screen readers (#2580). */}
          <span
            data-testid="distinguished-provisional-note"
            className="sr-only"
          >
            {' '}
            {PROVISIONAL_NOTE}
          </span>
        </span>
      </>
    )}
  </>
)
