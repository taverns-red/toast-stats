import React from 'react'
import { Link } from 'react-router-dom'
import { RedVoteMadeByLine } from '../RedVotePromo'
import { openConsentSettings } from '../../utils/consent'

declare const __APP_VERSION__: string

/* The site meta strip — attribution, data source, license, build version.
   Rendered by the desktop footer (AppShellFooter) and, on mobile where the
   footer is dropped, behind the "About ▾" nav disclosure (AppShellTopBar,
   #889). Single source so the version logic and license URL never drift. */

/* #2653 (CHR-28) — one unbreakable box per item, and each "·" a decorative
   element of its own, drawn in the gutter before its item. A line can only
   break between items; the group clips the gutter, so the item that starts a
   wrapped line shows no leading "·" and none is left at a line end. The "·"
   stays in the text, so "MIT License · <version>" still reads as one pair. */
const Item: React.FC<{ first?: boolean; children: React.ReactNode }> = ({
  first = false,
  children,
}) => (
  <span className="app-shell-footer__item">
    {!first && (
      <span className="app-shell-footer__sep" aria-hidden="true">
        ·
      </span>
    )}
    {children}
  </span>
)

const AppMeta: React.FC = () => {
  const version =
    typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

  return (
    <>
      <div className="app-shell-footer__group">
        <div className="app-shell-footer__list">
          <Item first>Toast Stats</Item>
          <Item>ts.taverns.red</Item>
          <Item>
            A{' '}
            <a
              href="https://taverns.red?utm_source=toast-stats&utm_medium=footer"
              target="_blank"
              rel="noopener noreferrer"
              className="app-shell-footer__link"
            >
              Red Taverns
            </a>{' '}
            production
          </Item>
          {/* #2584 — reopens the cookie and analytics choice. On the first
              line, not the meta strip: one more item there wraps the strip to
              another line, and the taller footer pushes /regions/changes over
              its CLS budget. AppMeta reaches the footer and the mobile About
              menu alike. */}
          <Item>
            <button
              type="button"
              className="consent-reopen app-shell-footer__link"
              onClick={openConsentSettings}
            >
              Privacy &amp; cookies
            </button>
          </Item>
        </div>
      </div>
      {/* #2090 — the Red Vote made-by line, in the footer on desktop and in
          the "About ▾" disclosure on mobile. */}
      <RedVoteMadeByLine placement="footer" />
      <div className="app-shell-footer__group app-shell-footer__meta">
        <div className="app-shell-footer__list" data-testid="app-version">
          <Item first>
            Data:{' '}
            <a
              href="https://dashboards.toastmasters.org"
              target="_blank"
              rel="noopener noreferrer"
              className="app-shell-footer__link"
            >
              dashboards.toastmasters.org
            </a>
          </Item>
          {/* /mcp entry point (#1165): AppMeta renders in both the desktop
              footer and the mobile "About ▾" disclosure (#889), so this one
              link covers every page at every breakpoint. Placed before the
              license so the "MIT License · <version>" slot pairing the
              version guard asserts on stays adjacent. */}
          <Item>
            <Link to="/mcp" className="app-shell-footer__link">
              MCP server
            </Link>
          </Item>
          {/* #2310 — same placement reasoning as the /mcp link. */}
          <Item>
            <Link to="/videos" className="app-shell-footer__link">
              How-to videos
            </Link>
          </Item>
          {/* The only contact path in the app (#1356). There is no backend to
              POST a form to, so this goes to the GitHub issue chooser, whose
              bug/feature templates live in .github/ISSUE_TEMPLATE/. Same
              placement reasoning as the /mcp link above: it sits BEFORE the
              license so the "MIT License · <version>" pairing stays adjacent
              for the version guard. */}
          <Item>
            <a
              href="https://github.com/taverns-red/toast-stats/issues/new/choose"
              target="_blank"
              rel="noopener noreferrer"
              className="app-shell-footer__link"
            >
              Report an issue
            </a>
          </Item>
          <Item>
            <a
              href="https://github.com/taverns-red/toast-stats/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="app-shell-footer__link"
            >
              MIT License
            </a>
          </Item>
          <Item>{version}</Item>
        </div>
      </div>
    </>
  )
}

export default AppMeta
