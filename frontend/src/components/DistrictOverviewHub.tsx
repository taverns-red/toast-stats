import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BottomSheet } from './BottomSheet'
import { KpiBulletCard } from './KpiBulletCard'
import { KpiDeltaCard } from './KpiDeltaCard'
import { MobileRowList, type MobileRow } from './MobileRowList'
import type { DistrictKpiStripData } from './DistrictKpiStrip'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'
import type { TrainingClub } from '../utils/officerTraining'
import {
  TIERED_KPI_GOALS,
  type SuccessPlanGoalKey,
  type SuccessPlanGoals,
} from '../utils/successPlanTargets'
import {
  buildActionList,
  orderActionSections,
  type ActionSectionId,
} from '../utils/actionListData'
import { buildDistrictSectionUrl } from '../config/districtSections'
import { DistrictHubTiles } from './DistrictHubTiles'
import {
  HUB_BULLET_TILES,
  HUB_DASH as DASH,
  HUB_NET_ABOUT,
  HUB_NET_CAPTION,
  HUB_NET_TITLE,
  type HubTileKey,
} from './districtHubTileMeta'

/* District Overview hub for phones (#1842, mobile epic #1827 Phase 2,
   review §5.5). Replaces the KPI strip below 768 (and on landscape phones):

     2×2 KPI tiles — number · delta · rank, nothing else; tapping a tile opens
                     a sheet with the full card (percentile, region rank,
                     bullet bar, tier markers) and what the metric means
     Needs attention — the Action List's sections as rows with counts, each a
                     deep link to its section, plus a link to the whole list

   No Sections list (#2093): the page's section nav already carries every
   district section (the bottom bar + More sheet on a portrait phone, the
   scroll-row in landscape), so a second list only pushed the data down.

   No sticky element, no collapse toggle (it cost the old strip a 44px column
   and squeezed the cards) and no hover tooltips. Desktop and tablet keep
   <DistrictKpiStrip> untouched; the page switches with DISTRICT_HUB_QUERY.

   Loading: the same markup with dashes in place of numbers (a structural
   skeleton, Lesson 158) — the tile and row counts are known before
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
  /**
   * Officers trained per club (#2296). The page loads it only in the last
   * 30 days of an open round — the only time it counts here (Ron, N10).
   */
  trainingClubs?: TrainingClub[] | null
  /** Success Plan goals for the year on screen, from `?targets=` (#2297);
   *  the tile sheets' cards draw them as Plan ticks. Owned by the page. */
  planGoals?: SuccessPlanGoals | null
  /** The Success Plan targets form (inline variant), opened in a sheet from
   *  a button in the Action List row (#2297). Absent → no button. */
  planTargetsPanel?: React.ReactNode
}

const TILE_GOAL = Object.fromEntries(
  TIERED_KPI_GOALS.map(g => [g.kpi, g.goal])
) as Record<HubTileKey, SuccessPlanGoalKey>

const ATTENTION_TITLES: Record<ActionSectionId, string> = {
  'action-close': 'Clubs close to Distinguished',
  'action-visits': 'Areas missing club visits',
  'action-intervention': 'Clubs needing intervention',
  'action-csp': 'No Club Success Plan',
  'action-training': 'Clubs short of officer training',
}

export const DistrictOverviewHub: React.FC<DistrictOverviewHubProps> = ({
  districtId,
  programYear,
  snapshotDate,
  kpis,
  clubs,
  interventionClubs,
  trainingClubs,
  planGoals = null,
  planTargetsPanel = null,
}) => {
  const [openTile, setOpenTile] = useState<HubTileKey | 'net' | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const planCount = planGoals ? Object.keys(planGoals).length : 0
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
        trainingClubs,
      }),
    [clubs, interventionClubs, snapshotDate, programYear, trainingClubs]
  )

  const attentionRows: MobileRow[] = orderActionSections(actionSections)
    .filter(id => id !== 'action-visits')
    // Officer training needs attention only in the round's final stretch.
    .filter(
      id => id !== 'action-training' || actionSections.trainingFinalStretch
    )
    .slice(0, 3)
    .map(id => {
      const count =
        id === 'action-close'
          ? actionSections.closeToDistinguished.length
          : id === 'action-intervention'
            ? actionSections.interventionRequired.length
            : id === 'action-training'
              ? actionSections.trainingShort.length
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

  const openMeta =
    openTile === 'net'
      ? { title: HUB_NET_TITLE, about: HUB_NET_ABOUT }
      : (HUB_BULLET_TILES.find(t => t.key === openTile) ?? null)

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
      <DistrictHubTiles kpis={kpis} onOpen={setOpenTile} />

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
        {/* One row: the Success Plan entry rides beside the Action List link
            (#2297) so the phone Overview gains no height — a separate
            disclosure row broke the hub's 4,000px page budget. */}
        <div className="district-hub__links" data-testid="district-hub-links">
          <Link
            to={buildDistrictSectionUrl(districtId, 'action-list')}
            className="district-hub__more-link"
          >
            Open the Action List →
          </Link>
          {planTargetsPanel && (
            <button
              type="button"
              className="district-hub__plan-btn"
              aria-haspopup="dialog"
              onClick={() => setPlanOpen(true)}
            >
              Success Plan targets
              {planCount > 0 && (
                <span className="district-hub__plan-count">
                  {' '}
                  · {planCount} set
                </span>
              )}
            </button>
          )}
        </div>
      </section>

      {planTargetsPanel && planOpen && (
        <BottomSheet
          isOpen
          onClose={() => setPlanOpen(false)}
          title="Success Plan targets"
        >
          {planTargetsPanel}
        </BottomSheet>
      )}

      {kpis && openMeta && (
        <BottomSheet
          isOpen
          onClose={() => setOpenTile(null)}
          title={openMeta.title}
        >
          <p className="district-hub__sheet-about">{openMeta.about}</p>
          {openTile === 'net' ? (
            <KpiDeltaCard
              title={HUB_NET_TITLE}
              current={kpis.netMemberChange.current}
              secondaryLabel={HUB_NET_CAPTION}
            />
          ) : (
            openTile && (
              <>
                <KpiBulletCard
                  title={openMeta.title}
                  current={kpis[openTile].current}
                  targets={kpis[openTile].targets}
                  rankings={kpis[openTile].rankings}
                  planTarget={planGoals?.[TILE_GOAL[openTile]]}
                />
                <p className="district-hub__sheet-legend">
                  Tier markers: <strong>D</strong> Distinguished ·{' '}
                  <strong>S</strong> Select · <strong>P</strong>{' '}
                  President&apos;s · <strong>Sm</strong> Smedley
                  {planGoals?.[TILE_GOAL[openTile]] !== undefined && (
                    <>
                      {' '}
                      · <strong>Plan</strong> Success Plan target
                    </>
                  )}
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
