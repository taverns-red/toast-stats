/**
 * The "vs last year" display column and phone-row meta for the Clubs table's
 * since-last-year preset (#2432). Like the Changes delta columns, it lives
 * outside COLUMN_CONFIGS (display only, no filter or sort metadata) and
 * ClubsTable appends it only while the preset is on.
 */
import { clubsColumnHelper as colHelper } from './clubsTableFeatures'
import { ChangeIndicator } from './ChangeIndicator'
import {
  lookupSinceLastYear,
  type NoPriorReason,
  type SinceLastYearEntry,
} from '../utils/sinceLastYear'

export const SINCE_LAST_YEAR_COLUMN_ID = 'sinceLastYear'

/** Short, neutral labels for a club with nothing to compare against. */
export const NO_PRIOR_LABELS: Record<NoPriorReason, string> = {
  'chartered-since': 'Chartered since',
  'not-in-district': 'Not in district then',
  'no-snapshot': 'No prior data',
}

/** Phone-row meta suffix: "(was 3)" or the no-prior label. */
export function sinceLastYearMeta(
  entry: SinceLastYearEntry | undefined
): string | null {
  if (!entry) return null
  if (entry.kind === 'no-prior') return NO_PRIOR_LABELS[entry.reason]
  return `was ${entry.then}`
}

/** The "vs last year" display column, shown only while the preset is on. */
export const buildSinceLastYearColumn = (
  byClub: ReadonlyMap<string, SinceLastYearEntry>
) =>
  colHelper.display({
    id: SINCE_LAST_YEAR_COLUMN_ID,
    header: 'vs last year',
    cell: info => {
      const { clubId } = info.row.original
      const entry = lookupSinceLastYear(byClub, clubId)
      return (
        <span
          className="clubs-since-cell"
          data-testid={`since-last-year-${clubId}`}
        >
          {!entry ? (
            <span className="clubs-cell-muted">—</span>
          ) : entry.kind === 'no-prior' ? (
            <span className="clubs-cell-muted">
              {NO_PRIOR_LABELS[entry.reason]}
            </span>
          ) : (
            <>
              <span className="tabular-nums">
                {entry.then} → {entry.now}
              </span>{' '}
              <ChangeIndicator value={entry.delta} />
            </>
          )}
        </span>
      )
    },
  })
