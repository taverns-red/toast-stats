import React from 'react'
import { Link } from 'react-router-dom'
import type {
  DiffEvent,
  DiffEventCategory,
} from '@taverns-red/shared-contracts'

/* District "What Changed" feed group (#1013/#1014, epic #1007 — entity links).
   Extracted from DistrictChangesPage so the link logic can be unit-tested
   directly without a full page mount (R22). Every DiffEvent.label is a
   pre-rendered sentence that BEGINS with its entity's display name — the club
   name for club events (membership/dcp/distinguished/roster), or `entityName`
   ("Division G" / "Area 2") for area/division status events (#1014). We link
   just that leading name token to the entity's scoped route and keep the rest
   of the sentence as plain text. districtId is the route param the page owns
   and passes down (R3); the entity id/name come from each event. */

/** The display name + scoped route for an event's entity, or null when the
    event has no linkable target (an aggregate/district-level line, or an area
    event missing its division ref — degrade gracefully to text, never a broken
    link). */
function resolveEntity(
  event: DiffEvent,
  districtId: string
): { name: string; href: string } | null {
  if (!districtId) return null
  const { clubId, clubName, divisionId, areaId, entityName } = event

  // Club-scoped event (the Phase-1 default).
  if (clubId && clubName) {
    return { name: clubName, href: `/district/${districtId}/club/${clubId}` }
  }
  // Area status event → division-scoped area route (#1008). Needs both refs.
  if (event.category === 'area-status' && areaId && divisionId && entityName) {
    return {
      name: entityName,
      href: `/district/${districtId}/division/${divisionId}/area/${areaId}`,
    }
  }
  // Division status event → division-scoped route (#1008).
  if (event.category === 'division-status' && divisionId && entityName) {
    return {
      name: entityName,
      href: `/district/${districtId}/division/${divisionId}`,
    }
  }
  return null
}

/** One change line: the leading entity name linked, the rest of the label as
    plain text. Falls back to plain text for an entity-less event, or when a
    label unexpectedly doesn't begin with the entity name — so a link is only
    ever rendered when it points somewhere real. */
const ChangeLabel: React.FC<{ event: DiffEvent; districtId: string }> = ({
  event,
  districtId,
}) => {
  const { label } = event
  const entity = resolveEntity(event, districtId)

  if (!entity || !label.startsWith(entity.name)) return <>{label}</>

  const rest = label.slice(entity.name.length)
  return (
    <>
      <Link to={entity.href} className="clubs-name-link">
        {entity.name}
      </Link>
      {rest}
    </>
  )
}

/* #1463 (epic #1458 Sprint 5) — the categories whose `magnitude` is a real
   signed QUANTITY, and so can be summed into a meaningful net.

   `diffSnapshots` emits `magnitude: membership.delta` / `payments.delta` /
   `dcpGoals.delta` for these three. Every other category carries a ±1
   direction FLAG instead (`club-added` is always +1, `club-removed` always −1,
   `distinguished` is +1 gained / −1 lost / 0 for a tier move). Summing flags
   would produce a number that looks like a quantity and isn't — so those
   groups keep the honest count-only heading (Lesson: a clamped/derived figure
   must never be rendered under a label that promises a signed delta). A new
   category is count-only by default: it has to be named here to grow a net. */
const NET_BEARING_CATEGORIES: ReadonlySet<DiffEventCategory> =
  new Set<DiffEventCategory>(['membership', 'payments', 'dcp-goals'])

/** The signed net for a group, or null when a net would be meaningless.
    Derived from the SAME events the group renders — never a parallel sum
    computed upstream, which could drift from the rows on screen. */
function netFor(
  category: DiffEventCategory,
  events: DiffEvent[]
): number | null {
  if (!NET_BEARING_CATEGORIES.has(category)) return null
  return events.reduce((sum, e) => sum + e.magnitude, 0)
}

/** Signed display for a net. Positives take '+', negatives U+2212 MINUS SIGN
    (never a hyphen, which reads as a dash mid-heading and is easy to lose next
    to the count separator) — matching ChangeIndicator's convention. Zero is
    rendered BARE: a signed '+0'/'−0' would be indistinguishable at a glance
    from a real ±1 movement, and "net 0" across a non-empty group is itself the
    answer the reader came for, not something to hide. */
function formatNet(net: number): string {
  if (net > 0) return `+${net.toLocaleString()}`
  if (net < 0) return `\u2212${Math.abs(net).toLocaleString()}`
  return '0'
}

/** Direction as a word for assistive tech — direction is never carried by
    colour alone (WCAG 1.4.1); the sign carries it visually, this carries it
    for a screen reader. */
function netDirectionWord(net: number): string {
  if (net > 0) return 'increase'
  if (net < 0) return 'decrease'
  return 'no net change'
}

export const ChangeGroup: React.FC<{
  category: DiffEventCategory
  heading: string
  events: DiffEvent[]
  /** Route district id, owned by the page and passed down (R3). */
  districtId: string
  /** Groups are open by default; collapsed when listed in ?expandChanges (#980). */
  collapsed: boolean
  onToggle: (category: DiffEventCategory, open: boolean) => void
}> = ({ category, heading, events, districtId, collapsed, onToggle }) => {
  if (events.length === 0) return null
  const net = netFor(category, events)
  return (
    <details
      className="changes-group"
      open={!collapsed}
      onToggle={e => onToggle(category, e.currentTarget.open)}
    >
      <summary className="changes-group__summary">
        {heading}{' '}
        <span
          className="changes-group__count"
          data-testid="changes-group-count"
        >
          ({events.length}
          {net !== null && (
            <>
              {' \u00b7 '}
              <span
                className={`changes-group__net changes-group__net--${
                  net > 0 ? 'up' : net < 0 ? 'down' : 'flat'
                }`}
                data-testid="changes-group-net"
              >
                net {formatNet(net)}
                <span className="sr-only"> {netDirectionWord(net)}</span>
              </span>
            </>
          )}
          )
        </span>
      </summary>
      <ul className="changes-group__list">
        {events.map(e => (
          <li
            key={`${e.category}-${e.clubId || e.divisionId || ''}-${e.areaId ?? ''}`}
            className="changes-group__item"
          >
            <ChangeLabel event={e} districtId={districtId} />
          </li>
        ))}
      </ul>
    </details>
  )
}
