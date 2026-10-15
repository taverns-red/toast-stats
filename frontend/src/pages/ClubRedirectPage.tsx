/**
 * ClubRedirectPage — district-free club URL (#320)
 *
 * Resolves /club/:clubId[?py=<startYear>] to
 * /district/:districtId/club/:clubId, keeping the query.
 *
 * #1804 — the district is the one the club was in FOR THAT PROGRAM YEAR,
 * from the club's one club-district history shard (#1782, ~12 KB):
 * `byProgramYear` for `?py=`, the latest span without it (or for a year the
 * history does not list). `ClubHistoryTable` year links come through here,
 * and a moved club's pre-move years used to land in its new district.
 * `config/club-index.json` (a CURRENT mapping, ~975 KB) is now only the
 * fallback, read when the shard does not list the club or is unavailable.
 */
import React from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { findClubEntry } from '@taverns-red/shared-contracts'
import { fetchCdnClubIndex } from '../services/cdn'
import { useClubDistrictHistoryEntry } from '../hooks/useClubDistrictHistoryEntry'
import {
  currentDistrictOf,
  districtForProgramYear,
} from '../utils/clubDistrictSpan'

/** `?py=2024` → "2024-2025"; anything else → null. */
function programYearLabelOf(raw: string | null): string | null {
  if (!raw || !/^\d{4}$/.test(raw)) return null
  const start = Number(raw)
  return `${start}-${start + 1}`
}

const ClubRedirectPage: React.FC = () => {
  const { clubId } = useParams<{ clubId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const {
    history,
    isLoading: isLoadingHistory,
    isShardAvailable,
  } = useClubDistrictHistoryEntry(clubId, true)

  const historyDistrict = React.useMemo(() => {
    if (!history) return null
    const py = programYearLabelOf(searchParams.get('py'))
    return (
      (py ? districtForProgramYear(history, py) : null) ??
      currentDistrictOf(history)
    )
  }, [history, searchParams])

  // The index only when the history cannot place the club.
  const needsIndex = !!clubId && !isLoadingHistory && !historyDistrict
  const {
    data,
    isLoading: isLoadingIndex,
    isError,
  } = useQuery({
    queryKey: ['club-index'],
    queryFn: fetchCdnClubIndex,
    staleTime: 15 * 60 * 1000,
    enabled: needsIndex,
  })

  React.useEffect(() => {
    if (!clubId) return
    // The index is keyed by whatever club-id form the snapshot that generated
    // it used; the URL carries whatever the user (or an old link) has. An
    // exact-key lookup turned that difference into "Club Not Found" (#1440).
    const districtId =
      historyDistrict ??
      (data ? findClubEntry(data.clubs, clubId)?.districtId : undefined)
    if (districtId) {
      const params = searchParams.toString()
      const url = `/district/${districtId}/club/${clubId}${params ? `?${params}` : ''}`
      navigate(url, { replace: true })
    }
  }, [historyDistrict, data, clubId, navigate, searchParams])

  const isLoading =
    isLoadingHistory || (needsIndex && isLoadingIndex) || !!historyDistrict

  if (isLoading) {
    return (
      <div
        className="tm-container"
        style={{ padding: '2rem', textAlign: 'center' }}
      >
        <div className="tm-loading-spinner" aria-label="Looking up club..." />
        <p className="text-gray-500 mt-4 font-tm-body">Looking up club...</p>
      </div>
    )
  }

  if (
    isError ||
    !data ||
    (data && clubId && !findClubEntry(data.clubs, clubId))
  ) {
    return (
      <div className="tm-container p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-lg mx-auto text-center">
          <h2 className="text-xl font-semibold text-red-800 mb-2">
            Club Not Found
          </h2>
          <p className="text-red-600 mb-4 font-tm-body">
            {isShardAvailable ? (
              `No club with number ${clubId} has been seen since 2017.`
            ) : (
              <>
                Club ID <code className="font-mono">{clubId}</code> was not
                found in the current data.
              </>
            )}
          </p>
          <a
            href="/"
            className="inline-block px-4 py-2 bg-tm-loyal-blue text-white rounded hover:bg-tm-loyal-blue-80 transition-colors"
          >
            Back to Rankings
          </a>
        </div>
      </div>
    )
  }

  return null
}

export default ClubRedirectPage
