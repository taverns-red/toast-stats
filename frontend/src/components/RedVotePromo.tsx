import React, { useId, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  RED_VOTE_COPY,
  activeRedVoteSeason,
  redVoteUrl,
  resolvePromoDate,
  type RedVotePlacement,
} from '../config/redVotePromo'
import { readJson, writeJson } from '../utils/localStorageStore'
import { trackEvent } from '../utils/analytics'

/* Red Vote promotion (#2090). District-level only — never on club pages.

     district surface — out of season, or once the banner is dismissed: a
                        quiet card. In season: the dismissible banner.
     landing surface  — in season only: the same dismissible banner.

   Both surfaces sit at the END of their page, after the data has rendered,
   so they never cover data, never push content down (no CLS) and leave the
   375 first-content budgets alone. Dismissal is one localStorage value per
   season (try/catch-wrapped in localStorageStore), so dismissing on one page
   dismisses everywhere, and the next season shows again. */

const DISMISS_KEY = 'red-vote-banner-dismissed'

function useRedVoteSeason() {
  const { search } = useLocation()
  return useMemo(
    () =>
      activeRedVoteSeason(
        resolvePromoDate(search, window.location.hostname, new Date())
      ),
    [search]
  )
}

function trackPromoClick(placement: RedVotePlacement) {
  trackEvent('select_promotion', {
    promotion_id: 'red-vote',
    promotion_name: 'Red Vote',
    creative_slot: placement,
  })
}

const PromoLink: React.FC<{
  placement: RedVotePlacement
  className: string
  children: React.ReactNode
}> = ({ placement, className, children }) => (
  <a
    href={redVoteUrl(placement)}
    target="_blank"
    rel="noopener noreferrer"
    className={className}
    onClick={() => trackPromoClick(placement)}
  >
    {children}
  </a>
)

export const RedVotePromo: React.FC<{ surface: 'district' | 'landing' }> = ({
  surface,
}) => {
  const headingId = useId()
  const season = useRedVoteSeason()
  const [dismissed, setDismissed] = useState<string | null>(() =>
    readJson<string | null>(DISMISS_KEY, null)
  )

  const banner = season !== null && dismissed !== season.key
  if (!banner && surface === 'landing') return null

  const placement: RedVotePlacement = banner
    ? 'seasonal-banner'
    : 'district-card'

  return (
    <aside
      aria-labelledby={headingId}
      className={`red-vote-promo${banner ? ' red-vote-promo--banner' : ''}`}
      data-testid="red-vote-promo"
    >
      <div className="red-vote-promo__text">
        <h2 id={headingId} className="red-vote-promo__heading">
          {banner ? RED_VOTE_COPY.bannerHeading : RED_VOTE_COPY.cardHeading}
        </h2>
        <p className="red-vote-promo__body">{RED_VOTE_COPY.body}</p>
        <p className="red-vote-promo__fine">
          {RED_VOTE_COPY.attribution} <span>{RED_VOTE_COPY.disclaimer}</span>
        </p>
      </div>
      <div className="red-vote-promo__actions">
        <PromoLink placement={placement} className="red-vote-promo__cta">
          {RED_VOTE_COPY.cta}
          <span className="sr-only"> (opens in a new tab)</span>
        </PromoLink>
        {banner && (
          <button
            type="button"
            className="red-vote-promo__dismiss"
            aria-label={RED_VOTE_COPY.dismissLabel}
            onClick={() => {
              writeJson(DISMISS_KEY, season.key)
              setDismissed(season.key)
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>
    </aside>
  )
}

/** "Free from Red Taverns · Also from us: Red Vote" — footer + Methodology. */
export const RedVoteMadeByLine: React.FC<{
  placement: Extract<RedVotePlacement, 'footer' | 'methodology'>
  className?: string
  linkClassName?: string
}> = ({ placement, className, linkClassName = 'app-shell-footer__link' }) => (
  <div className={className} data-testid="red-vote-made-by">
    {RED_VOTE_COPY.madeByPrefix}{' '}
    <PromoLink placement={placement} className={linkClassName}>
      {RED_VOTE_COPY.productName}
    </PromoLink>
    {' · '}
    {RED_VOTE_COPY.disclaimer}
  </div>
)
