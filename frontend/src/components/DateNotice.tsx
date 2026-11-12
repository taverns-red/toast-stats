import React, { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { setDateNotice, useDateNotice } from '../hooks/dateNoticeStore'
import { formatDisplayDate } from '../utils/dateFormatting'

/* "No data for <date>" (#2635). A shared or hand-edited ?date= that names no
   snapshot is resolved to the closest date we have by the controls hooks; this
   says so, once, above the page. The hook drops the bad param from the URL, so
   the explanation lives in dateNoticeStore, not in the URL. Mounted once in
   the app shell. */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const DateNotice: React.FC = () => {
  const notice = useDateNotice()
  const { pathname } = useLocation()

  // The notice belongs to the page it was raised on.
  const previousPath = useRef(pathname)
  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname
      setDateNotice(null)
    }
  }, [pathname])

  if (!notice) return null

  const shown = formatDisplayDate(notice.shown)
  const message = ISO_DATE.test(notice.requested)
    ? `No data for ${formatDisplayDate(notice.requested)}. Showing ${shown}, the closest date we have.`
    : `That date is not valid. Showing ${shown}, the latest date we have.`

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pt-3 md:px-6">
      <div
        role="status"
        data-testid="date-notice"
        className="redesign-panel flex items-center justify-between gap-3 px-4 py-3 text-sm"
        style={{ color: 'var(--ink)' }}
      >
        <span>{message}</span>
        <button
          type="button"
          className="tm-btn-secondary min-h-[44px] shrink-0"
          onClick={() => setDateNotice(null)}
          aria-label="Dismiss this notice"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
