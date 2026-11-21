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
import NotFoundPanel from '../components/NotFoundPanel'
import React from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
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

  const notFound =
    !isLoading &&
    (isError || !data || (data && clubId && !findClubEntry(data.clubs, clubId)))
  useDocumentTitle(notFound ? 'Club not found' : `Looking up club ${clubId}`)

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Looking up club..."
        className="p-8 text-center"
      >
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
      <NotFoundPanel
        heading={`Club ${clubId} isn't in our records`}
        message={
          isShardAvailable
            ? 'No club with this number has been seen since 2017. Check the number, or search for the club by name.'
            : "We couldn't find this club number in the current data. Check the number, or search for the club by name."
        }
      />
    )
  }

  return null
}

export default ClubRedirectPage
