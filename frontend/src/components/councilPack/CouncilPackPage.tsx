/* CouncilPackPage (#2299) — the routed shell around a council print pack:
 * holds the document's place while both reads settle, shows the page's error
 * state, then renders CouncilPackDocument. Shared by the Area and Division
 * print routes so the two cannot drift. */

import React from 'react'
import { SubpageBreadcrumb } from '../SubpageBreadcrumb'
import { LoadingSkeleton } from '../LoadingSkeleton'
import { EmptyState } from '../ErrorDisplay'
import { CouncilPackDocument } from './CouncilPackDocument'
import type { CouncilPackData } from '../../hooks/useCouncilPack'

export interface CouncilPackPageProps {
  kind: 'area' | 'division'
  districtId: string
  title: string
  parentName?: string | undefined
  /** The Area or Division page this pack summarises. */
  sourcePath: string
  /** The route's `?py=` / `?date=`, carried back to the source page. */
  search: string
  data: CouncilPackData
}

export const CouncilPackPage: React.FC<CouncilPackPageProps> = ({
  kind,
  districtId,
  title,
  parentName,
  sourcePath,
  search,
  data,
}) => {
  // Render-stable print time: the date a reader prints on, fixed per mount.
  const [printedAt] = React.useState(() => new Date())

  if (data.isError) {
    return (
      <EmptyState
        title="Could not load the print pack"
        message="The district analytics file is unavailable. Try again in a moment."
        icon="data"
      />
    )
  }

  const divisionPath = sourcePath.replace(/\/area\/[^/]+$/, '')
  const crumbs =
    kind === 'area'
      ? [
          { label: `District ${districtId}`, to: `/district/${districtId}` },
          { label: parentName ?? 'Division', to: `${divisionPath}${search}` },
          { label: title, to: `${sourcePath}${search}` },
          { label: 'Print pack' },
        ]
      : [
          { label: `District ${districtId}`, to: `/district/${districtId}` },
          { label: title, to: `${sourcePath}${search}` },
          { label: 'Print pack' },
        ]

  return (
    <div className="app-shell__page council-pack-root">
      <div className="council-pack__screen-only">
        <SubpageBreadcrumb crumbs={crumbs} />
      </div>
      {data.isPending || !data.pack || !data.snapshotDate ? (
        <div
          className="council-pack"
          data-testid="council-pack"
          aria-busy="true"
          aria-label={`${title} print pack, loading`}
        >
          <LoadingSkeleton variant="table" count={6} />
        </div>
      ) : (
        <CouncilPackDocument
          kind={kind}
          districtId={districtId}
          title={title}
          parentName={kind === 'area' ? parentName : undefined}
          pack={data.pack}
          programYear={data.programYear}
          snapshotDate={data.snapshotDate}
          asOfDate={data.asOfDate}
          sourcePath={sourcePath}
          backTo={`${sourcePath}${search}`}
          printedAt={printedAt}
        />
      )}
    </div>
  )
}
