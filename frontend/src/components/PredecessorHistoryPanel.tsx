/* "Before this district existed" (#2427). A district formed on 2026-07-01
   (the 201–231 series) has no prior-year data of its own. Its clubs do,
   under the districts they came from. This panel shows that history as
   aggregates per former district — never per club, never member names —
   and says plainly that it is the clubs' history, not the district's.

   Cost, in three steps (D201's join reads ~80 shards, ~1.1 MB gzipped):
   1. Until the panel's slot is near the viewport, nothing is fetched.
   2. Then ONE history shard, the oldest club's, decides whether to offer
      the panel: a club that was in this same district last year means the
      district is not new, and nothing renders. That is the common case, so
      established districts pay one ~12 KB shard, and only on scroll.
   3. The full join runs only when the reader expands the panel; it
      re-checks the gate over the whole roster.

   The program year is the page's own (R3). The gate is the history, never
   the snapshot index: the index lists an orphan 2026-06-30 file for every
   200-series district (#2439). */

import React, { useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { clubDistrictHistoryShardKey } from '@taverns-red/shared-contracts'
import { useNearViewport } from '../hooks/useNearViewport'
import { clubDistrictHistoryShardQuery } from '../hooks/clubDistrictHistoryQuery'
import {
  usePredecessorHistory,
  type PredecessorGroupSummary,
} from '../hooks/usePredecessorHistory'
import { findClubInShard } from '../utils/clubDistrictHistory'
import {
  pickProbeClubId,
  priorProgramYear,
  probeVerdict,
  type PredecessorAggregate,
} from '../utils/predecessorHistory'

export interface PredecessorHistoryPanelProps {
  districtId: string
  /** The page's program year label, e.g. "2026-2027" (R3). */
  programYear: string
  /** The current roster. */
  clubs: ReadonlyArray<{ clubId: string; charterDate?: string | undefined }>
}

const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`

const signed = (n: number): string =>
  n > 0 ? `+${n.toLocaleString()}` : n < 0 ? `−${(-n).toLocaleString()}` : '0'

/** "2 Select, 1 President's" — tiers that occur, highest first. */
function tierBreakdown(a: PredecessorAggregate): string {
  const parts: string[] = []
  if (a.byTier.M) parts.push(`${a.byTier.M} Smedley`)
  if (a.byTier.P) parts.push(`${a.byTier.P} President's`)
  if (a.byTier.S) parts.push(`${a.byTier.S} Select`)
  if (a.byTier.D) parts.push(`${a.byTier.D} Distinguished`)
  return parts.join(', ')
}

const Figures: React.FC<{ a: PredecessorAggregate }> = ({ a }) => (
  <dl className="predecessor-history__figures">
    <div>
      <dt>Members at year end</dt>
      <dd>{plural(a.members, 'member')}</dd>
    </div>
    <div>
      <dt>Change from base</dt>
      <dd>{signed(a.net)}</dd>
    </div>
    <div>
      <dt>Distinguished clubs</dt>
      <dd>
        {a.distinguished} Distinguished
        {a.distinguished > 0 && (
          <span className="predecessor-history__tiers">
            {' '}
            ({tierBreakdown(a)})
          </span>
        )}
      </dd>
    </div>
    <div>
      <dt>Average per club</dt>
      <dd>{a.avgDcpGoals === null ? '—' : `${a.avgDcpGoals} DCP goals`}</dd>
    </div>
  </dl>
)

const GroupCard: React.FC<{ g: PredecessorGroupSummary; py: number }> = ({
  g,
  py,
}) => (
  <li
    className="predecessor-history__group"
    data-testid={`predecessor-${g.districtId}`}
  >
    <h3 className="predecessor-history__group-title">
      <Link
        to={`/district/${g.districtId}?py=${py}`}
        className="predecessor-history__link"
      >
        District {g.districtId}
      </Link>
      <span className="predecessor-history__count">
        {plural(g.clubs, 'club')}
      </span>
    </h3>
    {g.yearEndDate === null ? (
      <p className="predecessor-history__note">
        District {g.districtId}&apos;s year-end report is not available.
      </p>
    ) : (
      <>
        <Figures a={g} />
        {g.found < g.clubs && (
          <p className="predecessor-history__note">
            {plural(g.clubs - g.found, 'club')} not in its year-end report.
          </p>
        )}
      </>
    )}
  </li>
)

export const PredecessorHistoryPanel: React.FC<
  PredecessorHistoryPanelProps
> = ({ districtId, programYear, clubs }) => {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const near = useNearViewport(slot)
  const [expanded, setExpanded] = useState(false)
  const bodyId = useId()
  const prior = useMemo(() => priorProgramYear(programYear), [programYear])

  const probeId = useMemo(() => pickProbeClubId(clubs), [clubs])
  const probe = useQuery({
    ...clubDistrictHistoryShardQuery(
      probeId ? clubDistrictHistoryShardKey(probeId) : ''
    ),
    enabled: near && probeId !== null,
  })
  const verdict =
    probe.data === undefined || !probeId
      ? null
      : probeVerdict(
          probe.data && findClubInShard(probe.data, probeId),
          districtId,
          prior.label
        )

  const clubIds = useMemo(() => clubs.map(c => c.clubId), [clubs])
  const history = usePredecessorHistory({
    districtId,
    priorYear: prior,
    clubIds,
    enabled: expanded && verdict === 'candidate',
  })

  // A zero-height marker until the gate says yes: no slot is reserved on
  // the established districts, which are almost all of them.
  if (verdict !== 'candidate' || history.status === 'not-new')
    return <div ref={setSlot} aria-hidden="true" />

  return (
    <section
      ref={setSlot}
      className="predecessor-history"
      aria-label="Before this district existed"
      data-testid="predecessor-history"
    >
      <h2 className="predecessor-history__heading">
        <button
          type="button"
          className="predecessor-history__toggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded(e => !e)}
        >
          <span className="predecessor-history__title">
            Before this district existed
          </span>
          <span className="predecessor-history__sub">
            Its clubs in {prior.label}
          </span>
        </button>
      </h2>
      <div id={bodyId} hidden={!expanded}>
        {expanded && <Body history={history} prior={prior} />}
      </div>
    </section>
  )
}

const Body: React.FC<{
  history: ReturnType<typeof usePredecessorHistory>
  prior: ReturnType<typeof priorProgramYear>
}> = ({ history, prior }) => {
  if (history.status === 'unavailable')
    return (
      <p className="predecessor-history__note">
        The club history is not available right now.
      </p>
    )
  if (history.status !== 'ready')
    return (
      <p className="predecessor-history__note" role="status">
        Loading club history
        {history.total > 0 ? ` (${history.loaded} of ${history.total})` : ''}…
      </p>
    )
  const { groups, totals, newCharters } = history
  return (
    <div className="predecessor-history__body">
      <p className="predecessor-history__lede">
        The history of the current clubs under their former districts, at the{' '}
        {prior.label} year end. These are the clubs&apos; results, not this
        district&apos;s.
      </p>
      <ul className="predecessor-history__groups">
        {groups.map(g => (
          <GroupCard key={g.districtId} g={g} py={prior.year} />
        ))}
      </ul>
      {groups.length > 1 && totals && (
        <div
          className="predecessor-history__group predecessor-history__group--total"
          data-testid="predecessor-total"
        >
          <h3 className="predecessor-history__group-title">
            All former districts
            <span className="predecessor-history__count">
              {plural(totals.clubs, 'club')}
            </span>
          </h3>
          <Figures a={totals} />
        </div>
      )}
      {newCharters > 0 && (
        <p className="predecessor-history__note">
          {newCharters === 1
            ? `1 club has no ${prior.label} record`
            : `${newCharters.toLocaleString()} clubs have no ${prior.label} record`}{' '}
          (new charters).
        </p>
      )}
    </div>
  )
}
