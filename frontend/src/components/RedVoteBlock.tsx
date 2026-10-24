/* RedVoteBlock (#2249) — the landing's one Red Vote surface: a
   self-contained block in Red Vote's own colours, logo and type, prominent
   but secondary (after the World pulse, before the rankings).

   Brand (Red Vote, brand v1.0, ADR 0004 in taverns-red/ops):
   - the mark is the red pennant with a white "V" — `public/brand/
     pennant-vote.svg` in taverns-red/red-vote (sha b041cbd7…), the same
     file as `docs/brand/pennant-vote.svg` in taverns-red/ops. It is inlined
     here (not an <img>) so the "V" is set in the page's self-hosted Space
     Grotesk, as the file asks; an <img> SVG cannot reach a page font.
   - there is NO standalone "Red Vote" wordmark: Red Vote's own chrome sets
     the name as text beside the pennant, so this does the same.
   - colours and type come from the local brand tokens (rt-brand-v1.css):
     --rt-vote (= --rt-red), --rt-red-dk, --rt-red-soft, --rt-paper,
     --rt-bg-2, --rt-ink*, Space Grotesk + Inter. The stylesheet is the one
     allowlisted exception in noProductAccentUntilPhase2.test.ts (#2080);
     this file carries no brand value (the pennant's fills are classes). The
     source file's fills are #E63946 (flag) and #F4F1EB (the V), which are
     --rt-vote and --rt-ink-on-dk.

   Copy, link and seasons live in config/redVotePromo.ts (ops#117). Static:
   no data, no fetch, no dismiss (a section, not a banner), so it is its
   own reserve and the data landing moves nothing. */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  RED_VOTE_COPY,
  activeRedVoteSeason,
  redVoteUrl,
  resolvePromoDate,
} from '../config/redVotePromo'
import { trackEvent } from '../utils/analytics'

const PLACEMENT = 'landing-block' as const

/** Red Vote's pennant mark, inlined (see the header). Decorative: the
    wordmark beside it carries the name. */
const Pennant: React.FC = () => (
  <svg
    className="red-vote-block__pennant"
    viewBox="0 0 140 100"
    width="42"
    height="30"
    aria-hidden="true"
    focusable="false"
  >
    <path
      className="red-vote-block__pennant-flag"
      d="M0 0 H120 L140 50 L120 100 H0 Z"
    />
    <text
      className="red-vote-block__pennant-v"
      x="58"
      y="74"
      textAnchor="middle"
      fontWeight="800"
      fontSize="62"
      letterSpacing="-3"
    >
      V
    </text>
  </svg>
)

export const RedVoteBlock: React.FC = () => {
  const headingId = useId()
  const { search } = useLocation()

  // Brand fonts only once the page has settled (mobile Lighthouse gate):
  // the block is below the fold at every width, and fetching Space
  // Grotesk + Inter (71 KB) at first paint cost the landing ~480ms of LCP.
  // Until then the stacks name only the metric-matched fallback faces
  // (nothing to fetch) and the switch is reflow-free. Triggers: the first
  // scroll, pointer or key (the page is in use), or the block itself in
  // view (tall viewports). Not a positive observer margin: the loading
  // shell is shorter than the loaded page, so a margin reached the block
  // at mount and the fonts were in the first paint after all.
  const ref = useRef<HTMLElement>(null)
  const [brandFonts, setBrandFonts] = useState(
    () => typeof IntersectionObserver === 'undefined'
  )
  useEffect(() => {
    const el = ref.current
    if (brandFonts || !el || typeof IntersectionObserver === 'undefined') {
      return
    }
    const arm = () => setBrandFonts(true)
    const events = ['scroll', 'pointerdown', 'keydown', 'touchstart'] as const
    for (const ev of events) {
      window.addEventListener(ev, arm, { once: true, passive: true })
    }
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) arm()
      },
      { rootMargin: '0px' }
    )
    io.observe(el)
    return () => {
      io.disconnect()
      for (const ev of events) window.removeEventListener(ev, arm)
    }
  }, [brandFonts])
  const season = useMemo(
    () =>
      activeRedVoteSeason(
        resolvePromoDate(search, window.location.hostname, new Date())
      ),
    [search]
  )

  return (
    <section
      ref={ref}
      className={`red-vote-block${brandFonts ? ' red-vote-block--brand-fonts' : ''}`}
      aria-labelledby={headingId}
      data-testid="red-vote-block"
    >
      <div className="red-vote-block__brand">
        <Pennant />
        <span className="red-vote-block__wordmark">
          {RED_VOTE_COPY.productName}
        </span>
      </div>
      <div className="red-vote-block__text">
        <p
          className="red-vote-block__eyebrow"
          data-testid="red-vote-block-eyebrow"
        >
          {season
            ? RED_VOTE_COPY.blockEyebrowSeason
            : RED_VOTE_COPY.blockEyebrow}
        </p>
        <h2 id={headingId} className="red-vote-block__heading">
          {RED_VOTE_COPY.cardHeading}
        </h2>
        <p className="red-vote-block__body">{RED_VOTE_COPY.body}</p>
        <p className="red-vote-block__fine">
          {RED_VOTE_COPY.attribution} {RED_VOTE_COPY.disclaimer}
        </p>
      </div>
      <div className="red-vote-block__actions">
        <a
          href={redVoteUrl(PLACEMENT)}
          target="_blank"
          rel="noopener noreferrer"
          className="red-vote-block__cta"
          onClick={() =>
            trackEvent('select_promotion', {
              promotion_id: 'red-vote',
              promotion_name: 'Red Vote',
              creative_slot: PLACEMENT,
            })
          }
        >
          {RED_VOTE_COPY.cta}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </section>
  )
}
