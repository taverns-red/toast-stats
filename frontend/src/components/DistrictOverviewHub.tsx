import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BottomSheet } from './BottomSheet'
import { KpiBulletCard } from './KpiBulletCard'
import { KpiDeltaCard } from './KpiDeltaCard'
import { MobileRowList, type MobileRow } from './MobileRowList'
import type {
  DistrictKpiCardData,
  DistrictKpiStripData,
} from './DistrictKpiStrip'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'
import {
  buildActionList,
  orderActionSections,
  type ActionSectionId,
} from '../utils/actionListData'
import {
  DISTRICT_SECTIONS,
  buildDistrictSectionUrl,
} from '../config/districtSections'
import { formatSigned, nextTierText, worldRankText } from '../utils/districtHub'

/* District Overview hub for phones (#1842, mobile epic #1827 Phase 2,
   review §5.5). Replaces the KPI strip below 768 (and on landscape phones):

     2×2 KPI tiles — number · delta · rank, nothing else; tapping a tile opens
                     a sheet with the full card (percentile, region rank,
                     bullet bar, tier markers) and what the metric means
     Needs attention — the Action List's sections as rows with counts, each a
                     deep link to its section, plus a link to the whole list
     Sections        — the district's other routes as rows, with counts

   No sticky element, no collapse toggle (it cost the old strip a 44px column
   and squeezed the cards) and no hover tooltips. Desktop and tablet keep
   <DistrictKpiStrip> untouched; the page switches with DISTRICT_HUB_QUERY.

   Loading: the same markup with dashes in place of numbers (a structural
   skeleton, Lesson 158) — the tile, row and section counts are known before
   data, and the Club Success Plan row is gated on the page's program year
   (R3), so the loaded hub is the same height as the loading one. */

export interface DistrictOverviewHubProps {
  districtId: string
  /** Program-year label ("YYYY-YYYY") the page shows — owned by the page (R3). */
  programYear: string
  /** The snapshot date the page pinned (`YYYY-MM-DD`). */
  snapshotDate: string | undefined
  /** The same KPI values the desktop strip receives; null while loading. */
  kpis: DistrictKpiStripData | null
  /** Analytics club rows; null while loading. */
  clubs: ClubTrend[] | null
  /** Clubs the analytics already classified intervention-required. */
  interventionClubs: ClubTrend[] | null
}

type TileKey = 'paidClubs' | 'membershipPayments' | 'distinguishedClubs'

/* `label` is the tile's one-line name (a 160px tile at 375 fits ~16
   characters); `title` is the full name — read out with the tile, and the
   sheet's heading. */
const BULLET_TILES: {
  key: TileKey
  title: string
  label: string
  about: string
}[] = [
  {
    key: 'paidClubs',
    title: 'Paid Clubs',
    label: 'Paid clubs',
    about:
      'Paid clubs count with thresholds for each Distinguished District recognition level.',
  },
  {
    key: 'membershipPayments',
    title: 'Membership Payments',
    label: 'Payments',
    about:
      'Total membership payments (New + April + October + Late + Charter) with thresholds for each Distinguished District recognition level.',
  },
  {
    key: 'distinguishedClubs',
    title: 'Distinguished Clubs',
    label: 'Distinguished',
    about:
      'Clubs achieving DCP goals + membership requirements with thresholds for each Distinguished District recognition level.',
  },
]

const NET_TITLE = 'Net Member Change'
const NET_LABEL = 'Net change'
const NET_ABOUT =
  "Membership payments minus the program-year payment base (the recognition baseline). This differs from the Trends 'Net Change', which compares member counts against the first snapshot of the year."

const ATTENTION_TITLES: Record<ActionSectionId, string> = {
  'action-close': 'Clubs close to Distinguished',
  'action-visits': 'Areas missing club visits',
  'action-intervention': 'Clubs needing intervention',
  'action-csp': 'No Club Success Plan',
}

const DASH = '—'

interface TileProps {
  title: string
  label: string
  value: string
  delta: string | null
  rank: string | null
  tone?: 'up' | 'down' | undefined
  onOpen: () => void
  disabled: boolean
}

const Tile: React.FC<TileProps> = ({
  title,
  label,
  value,
  delta,
  rank,
  tone,
  onOpen,
  disabled,
}) => (
  <li className="district-hub__tile-item">
    <button
      type="button"
      className="district-hub__tile"
      data-testid="district-hub-tile"
      onClick={onOpen}
      disabled={disabled}
      aria-haspopup="dialog"
    >
      <span className="district-hub__tile-title">
        <span aria-hidden="true">{label}</span>
        <span className="sr-only">{title}</span>
      </span>
      <span
        className={`district-hub__tile-value${
          tone ? ` district-hub__tile-value--${tone}` : ''
        }`}
      >
        {value}
      </span>
      <span className="district-hub__tile-line district-hub__tile-line--delta">
        {delta ?? DASH}
      </span>
      {/* Empty string = no rank for this metric: keep the line for height. */}
      <span className="district-hub__tile-line">
        {rank === '' ? '\u00a0' : (rank ?? DASH)}
      </span>
    </button>
  </li>
)

export const DistrictOverviewHub: React.FC<DistrictOverviewHubProps> = ({
  districtId,
  programYear,
  snapshotDate,
  kpis,
  clubs,
  interventionClubs,
}) => {
  const [openTile, setOpenTile] = useState<TileKey | 'net' | null>(null)
  const loading = kpis === null || clubs === null

  const actionSections = useMemo(
    () =>
      buildActionList({
        clubs: clubs ?? [],
        interventionClubs: interventionClubs ?? [],
        // Visit gaps need the division snapshot the Overview does not load;
        // that section stays on the Action List itself.
        divisions: [],
        snapshotDate: snapshotDate ?? '',
        programYear,
      }),
    [clubs, interventionClubs, snapshotDate, programYear]
  )

  const attentionRows: MobileRow[] = orderActionSections(actionSections)
    .filter(id => id !== 'action-visits')
    .slice(0, 3)
    .map(id => {
      const count =
        id === 'action-close'
          ? actionSections.closeToDistinguished.length
          : id === 'action-intervention'
            ? actionSections.interventionRequired.length
            : actionSections.cspNotSubmitted.length
      return {
        id,
        to: `${buildDistrictSectionUrl(districtId, 'action-list')}#${id}`,
        title: ATTENTION_TITLES[id],
        chip: (
          <span className="district-hub__count">
            {loading ? DASH : count.toLocaleString()}
          </span>
        ),
      }
    })

  const divisionCount = useMemo(
    () => (clubs ? new Set(clubs.map(c => c.divisionId)).size : null),
    [clubs]
  )
  const sectionCounts: Record<string, number | null> = {
    clubs: clubs ? clubs.length : null,
    divisions: divisionCount,
  }
  const sectionRows: MobileRow[] = DISTRICT_SECTIONS.filter(
    s => s.segment !== ''
  ).map(s => ({
    id: s.segment,
    to: buildDistrictSectionUrl(districtId, s.segment),
    title: s.label,
    chip:
      s.segment in sectionCounts ? (
        <span className="district-hub__count">
          {sectionCounts[s.segment]?.toLocaleString() ?? DASH}
        </span>
      ) : undefined,
  }))

  const bulletCard = (key: TileKey): DistrictKpiCardData | null =>
    kpis ? kpis[key] : null
  const openMeta =
    openTile === 'net'
      ? { title: NET_TITLE, about: NET_ABOUT }
      : (BULLET_TILES.find(t => t.key === openTile) ?? null)

  return (
    <section
      aria-labelledby="district-hub-heading"
      aria-busy={loading ? 'true' : undefined}
      className={`district-hub${loading ? ' district-hub--loading' : ''}`}
      data-testid="district-hub-mobile"
    >
      <h2 id="district-hub-heading" className="sr-only">
        Key district metrics
      </h2>
      <ul className="district-hub__tiles" data-testid="district-hub-tiles">
        {BULLET_TILES.map(t => {
          const card = bulletCard(t.key)
          return (
            <Tile
              key={t.key}
              title={t.title}
              label={t.label}
              value={card ? card.current.toLocaleString() : DASH}
              delta={card ? nextTierText(card.current, card.targets) : null}
              rank={card ? worldRankText(card.rankings) : null}
              onOpen={() => setOpenTile(t.key)}
              disabled={!card}
            />
          )
        })}
        <Tile
          title={NET_TITLE}
          label={NET_LABEL}
          value={kpis ? formatSigned(kpis.netMemberChange.current) : DASH}
          delta="payments vs. program-year base"
          rank=""
          tone={
            kpis
              ? kpis.netMemberChange.current > 0
                ? 'up'
                : kpis.netMemberChange.current < 0
                  ? 'down'
                  : undefined
              : undefined
          }
          onOpen={() => setOpenTile('net')}
          disabled={!kpis}
        />
      </ul>

      <section
        aria-labelledby="district-hub-attention-heading"
        className="district-hub__block"
        data-testid="district-hub-attention"
      >
        <h3
          id="district-hub-attention-heading"
          className="district-hub__block-title"
        >
          Needs attention
        </h3>
        <MobileRowList label="Needs attention" rows={attentionRows} />
        <Link
          to={buildDistrictSectionUrl(districtId, 'action-list')}
          className="district-hub__more-link"
        >
          Open the Action List →
        </Link>
      </section>

      <nav
        aria-label="District sections list"
        className="district-hub__block"
        data-testid="district-hub-sections"
      >
        <h3 className="district-hub__block-title">Sections</h3>
        <MobileRowList label="District sections" rows={sectionRows} />
      </nav>

      {kpis && openMeta && (
        <BottomSheet
          isOpen
          onClose={() => setOpenTile(null)}
          title={openMeta.title}
        >
          <p className="district-hub__sheet-about">{openMeta.about}</p>
          {openTile === 'net' ? (
            <KpiDeltaCard
              title={NET_TITLE}
              current={kpis.netMemberChange.current}
              secondaryLabel="payments vs. program-year base"
            />
          ) : (
            openTile && (
              <>
                <KpiBulletCard
                  title={openMeta.title}
                  current={kpis[openTile].current}
                  targets={kpis[openTile].targets}
                  rankings={kpis[openTile].rankings}
                />
                <p className="district-hub__sheet-legend">
                  Tier markers: <strong>D</strong> Distinguished ·{' '}
                  <strong>S</strong> Select · <strong>P</strong>{' '}
                  President&apos;s · <strong>Sm</strong> Smedley
                </p>
              </>
            )
          )}
        </BottomSheet>
      )}
    </section>
  )
}

export default DistrictOverviewHub
