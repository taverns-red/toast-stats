import { Link } from 'react-router-dom'
import type { ClubDistrictNotice } from '../../utils/clubDistrictSpan'

/**
 * #1804 — the club page shows another district's data than its URL names:
 * "In 2024–25 this club was in District 1." / "This club moved to District
 * 201 after June 30, 2026.", what the page is showing, and a link that opens
 * the page under that district. A status note, not an alert: nothing is
 * wrong, the page has already shown the right data.
 */
export function ClubDistrictBanner({
  notice,
  openTo,
}: {
  notice: ClubDistrictNotice
  openTo: string
}) {
  return (
    <aside className="club-district-banner" aria-label="District for this year">
      <p className="club-district-banner__text">
        <strong className="club-district-banner__headline">
          {notice.headline}
        </strong>{' '}
        <span>{notice.detail}</span>
      </p>
      <Link to={openTo} className="club-district-banner__link">
        {notice.openLabel}
      </Link>
    </aside>
  )
}
