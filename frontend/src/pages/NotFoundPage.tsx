import React from 'react'
import { useLocation } from 'react-router-dom'
import NotFoundPanel from '../components/NotFoundPanel'
import { useDistricts } from '../hooks/useDistricts'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { resolveRouteRecovery } from '../utils/errorRecovery'

const HEADING = "We couldn't find that page"

/** The catch-all route: any URL that matches no page, shown inside the shell. */
const NotFoundPage: React.FC = () => {
  const { pathname } = useLocation()
  useDocumentTitle(HEADING)
  const { data } = useDistricts()
  const recovery = resolveRouteRecovery(
    pathname,
    data?.districts.map(d => d.id) ?? []
  )
  // The districts index is the panel's own home button, so only a real
  // district's subpages are worth a chip here.
  const suggestions =
    recovery.kind === 'district-subpages' ? recovery.suggestions : []

  return (
    <NotFoundPanel
      heading={HEADING}
      message={`Nothing is at ${pathname}. The link may be old or mistyped.`}
      suggestionsLead={`Did you mean one of District ${recovery.districtId}'s pages?`}
      suggestions={suggestions}
    />
  )
}

export default NotFoundPage
