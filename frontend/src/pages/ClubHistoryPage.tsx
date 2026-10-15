/**
 * ClubHistoryPage (#1229, epic #1228) — the deep-linkable per-club historical
 * view at `/district/:districtId/club/:clubId/history`.
 *
 * Renders one row per program year (DCP, Distinguished tier, membership,
 * renewals, status) from existing year-end snapshots — no pipeline change.
 * Route nesting follows the real router (`district/:districtId/club/:clubId/…`,
 * Lesson 80), not the issue stub's `/club/:id/history`.
 */

import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDistricts } from '../hooks/useDistricts'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useClubHistory } from '../hooks/useClubHistory'
import { SubpageBreadcrumb } from '../components/SubpageBreadcrumb'
import { ContextBar } from '../components/ContextBar'
import { ClubHistoryTable } from '../components/ClubHistoryTable'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { EmptyState, ErrorDisplay } from '../components/ErrorDisplay'
import { exportClubHistory } from '../utils/csvExport'
import { sameDistrict, summarizeClubHistoryGaps } from '../utils/clubHistory'

export default function ClubHistoryPage() {
  const { districtId, clubId } = useParams<{
    districtId: string
    clubId: string
  }>()

  const { data: districtsData } = useDistricts()
  const rawName = useMemo(() => {
    const match = districtsData?.districts?.find(d => d.id === districtId)
    return match?.name || districtId || ''
  }, [districtsData, districtId])
  const districtName = /^\d+$/.test(rawName) ? `District ${rawName}` : rawName

  const { rows, gaps, clubName, isLoading, isError } = useClubHistory(
    districtId,
    clubId
  )

  // Which completed years produced no row, and why (#1437). Without this,
  // "this club moved districts", "that snapshot is missing" and "this club has
  // no history" are the same empty table.
  const gapNote = useMemo(
    () =>
      summarizeClubHistoryGaps(gaps, {
        districtLabel: districtName,
        ...(districtId ? { pageDistrictId: districtId } : {}),
      }),
    [gaps, districtName, districtId]
  )

  // #1803 — the District column only when it tells the reader something: a
  // year recorded under a district other than this page's (a moved club).
  const showDistrict = useMemo(
    () =>
      !!districtId &&
      rows.some(r => r.districtId && !sameDistrict(r.districtId, districtId)),
    [rows, districtId]
  )

  const heading = clubName || `Club ${clubId}`
  useDocumentTitle(`${heading} — History`)

  const clubDetailPath = `/district/${districtId}/club/${clubId}`

  const exportCsv = () =>
    exportClubHistory(rows, districtId || '', clubId || '', heading)

  return (
    <div className="club-history-page">
      {/* Phone context bar (#1831): below 768 it replaces the breadcrumb and
          the header. No PY state here (one row per program year), so the chip
          opens About, Export and the trail. */}
      <ContextBar
        title={`${heading} — History`}
        back={{ label: heading, to: clubDetailPath }}
        chipLabel="About"
        actions={
          rows.length > 0 ? (
            <button
              type="button"
              className="context-sheet__action"
              onClick={exportCsv}
            >
              Export CSV
            </button>
          ) : undefined
        }
        about="Multi-year performance by program year. Each row is the club's settled value at the close of that program year."
        trail={[
          { label: 'Districts', to: '/' },
          { label: districtName, to: `/district/${districtId}` },
          { label: 'Clubs', to: `/district/${districtId}/clubs` },
          { label: heading, to: clubDetailPath },
          { label: 'History' },
        ]}
      />
      <SubpageBreadcrumb
        crumbs={[
          { label: districtName, to: `/district/${districtId}` },
          { label: 'Clubs', to: `/district/${districtId}/clubs` },
          { label: heading, to: clubDetailPath },
          { label: 'History' },
        ]}
      />

      <header className="club-history-page__header">
        <div>
          <h1 className="club-history-page__title">{heading} — History</h1>
          <p className="club-history-page__sub">
            Multi-year performance by program year. Each row is the club&rsquo;s
            settled value at the close of that program year.
          </p>
        </div>
        {rows.length > 0 && (
          <button
            type="button"
            className="club-history-page__export"
            onClick={exportCsv}
          >
            Export CSV
          </button>
        )}
      </header>

      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <ErrorDisplay error="Could not load this club's history. Please try again." />
      ) : rows.length === 0 ? (
        <EmptyState
          message={
            gapNote
              ? `No completed program years on file for ${heading} under ${districtName}. ${gapNote}`
              : `No completed program years on file yet for ${heading}. History appears once a program year closes (June 30).`
          }
        />
      ) : (
        <>
          {/* No page `districtId` prop, by design (#1441): the page's current
              district is not a fact about the club's 2022 row. Each row
              carries its own (#1803), and its year links there. */}
          <ClubHistoryTable
            rows={rows}
            clubName={heading}
            clubId={clubId}
            showDistrict={showDistrict}
          />
          {gapNote && (
            <p className="club-history-page__gaps" role="note">
              {gapNote}
            </p>
          )}
        </>
      )}

      <p className="club-history-page__back">
        <Link to={clubDetailPath}>← Back to {heading}</Link>
      </p>
    </div>
  )
}
