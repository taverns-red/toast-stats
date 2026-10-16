/**
 * Red Vote promotion (#2090) — the one home of its copy, link and seasons,
 * so the brand and copy review (taverns-red/ops#117) edits a single file.
 *
 * Audience: district leaders. Red Vote runs District Council votes and
 * District Executive Committee meetings; it is not for club officer
 * elections, so nothing here is ever placed on a club page. Targeting is by
 * date only — never by member or club data.
 */

export const PROD_HOSTNAME = 'ts.taverns.red'

const RED_VOTE_BASE_URL = 'https://taverns.red/red-vote'

/** Where a link sits; it becomes the link's `utm_medium` and the GA slot. */
export type RedVotePlacement =
  'district-card' | 'seasonal-banner' | 'footer' | 'methodology'

export const RED_VOTE_COPY = {
  cardHeading: 'Run your DEC and District Council votes with Red Vote',
  bannerHeading: 'District Council voting season',
  body: 'Running DEC meetings or District Council votes? Red Vote handles secure district voting.',
  cta: 'See Red Vote',
  attribution: 'Red Vote is from Red Taverns, the makers of Toast Stats.',
  disclaimer: 'Not affiliated with Toastmasters International.',
  dismissLabel: 'Dismiss the Red Vote banner',
  madeByPrefix: 'Free from Red Taverns · Also from us:',
  productName: 'Red Vote',
} as const

/** The UTM-tagged marketing-page link for one placement. */
export function redVoteUrl(placement: RedVotePlacement): string {
  const params = new URLSearchParams({
    utm_source: 'toast-stats',
    utm_medium: placement,
    utm_campaign: 'red-vote',
  })
  return `${RED_VOTE_BASE_URL}?${params.toString()}`
}

/** Inclusive month/day windows (1-indexed months), in the viewer's time. */
export const RED_VOTE_SEASONS = [
  { id: 'spring', start: [3, 1], end: [5, 31] },
  { id: 'autumn', start: [8, 1], end: [9, 30] },
] as const

export interface RedVoteSeason {
  id: (typeof RED_VOTE_SEASONS)[number]['id']
  /** Unique per year, so a dismissal never carries into the next season. */
  key: string
}

export function activeRedVoteSeason(date: Date): RedVoteSeason | null {
  const md = (date.getMonth() + 1) * 100 + date.getDate()
  for (const s of RED_VOTE_SEASONS) {
    const start = s.start[0] * 100 + s.start[1]
    const end = s.end[0] * 100 + s.end[1]
    if (md >= start && md <= end) {
      return { id: s.id, key: `${date.getFullYear()}-${s.id}` }
    }
  }
  return null
}

/**
 * The promotion's clock. `?promoDate=YYYY-MM-DD` overrides it everywhere
 * except production, so the PR preview can show either season.
 */
export function resolvePromoDate(
  search: string,
  hostname: string,
  now: Date
): Date {
  if (hostname === PROD_HOSTNAME) return now
  const raw = new URLSearchParams(search).get('promoDate')
  const m = raw?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return now
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d, 12)
  const valid =
    date.getFullYear() === y &&
    date.getMonth() === mo - 1 &&
    date.getDate() === d
  return valid ? date : now
}
