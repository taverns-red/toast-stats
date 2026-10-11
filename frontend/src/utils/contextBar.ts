import type { ProgramYear } from './programYear'

/* Non-component helpers for the phone context bar + bottom sheet (#1831),
   kept out of the component files so they stay fast-refresh clean. */

/** "PY 26–27" — the compact two-digit form the context bar has room for. */
export const formatPyCompact = (py: ProgramYear): string =>
  `PY ${String(py.year).slice(-2)}–${String(py.year + 1).slice(-2)}`

/** Downward drag on the bottom sheet's handle, in px, that dismisses it. */
export const SWIPE_CLOSE_PX = 60
