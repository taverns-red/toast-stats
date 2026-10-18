import React from 'react'
import type { CharterCohortSurvivalRollupState } from '../../hooks/useCharterCohortSurvivalRollup'
import type { CharterCohortSurvivalScope } from '../../utils/charterCohortSurvival'
import { CharterSurvivalView } from '../CharterSurvivalView'
import { LoadingSkeleton } from '../LoadingSkeleton'

/* The body of `/region/:n/growth/survival` and `/regions/growth/survival`
   (#1818): the shared survival view once the file is in, and an honest
   status otherwise. A missing file is "not available yet", never an empty
   or zero curve; a failed load says so. */

export const RollupSurvivalBody: React.FC<{
  state: CharterCohortSurvivalRollupState
  scope: CharterCohortSurvivalScope
}> = ({ state, scope }) => {
  const name = scope.kind === 'world' ? 'Worldwide' : `Region ${scope.regionId}`
  if (state.status === 'not-available') {
    return (
      <p
        className="rollup-page__empty"
        role="status"
        data-testid="survival-not-available"
      >
        {name} club survival is not available yet. The data pipeline folds it
        from the club history with each daily run; it appears here once a run
        has published it.
      </p>
    )
  }
  if (state.status === 'error') {
    return (
      <p
        className="rollup-page__empty"
        role="status"
        data-testid="survival-not-available"
      >
        {name} club survival could not be loaded right now. Try again later.
      </p>
    )
  }
  if (!state.survival) {
    // Reserved taller than the viewport, so the content landing never
    // pushes the footer (CLS).
    return (
      <div className="survival-loading" aria-busy="true">
        <p className="survival-note" role="status">
          Loading club survival…
        </p>
        <LoadingSkeleton variant="card" />
      </div>
    )
  }
  return <CharterSurvivalView survival={state.survival} scope={scope} />
}

export default RollupSurvivalBody
