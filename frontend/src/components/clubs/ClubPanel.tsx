import React, { useState } from 'react'
import { useIsMobile } from '../../hooks/useIsMobile'

/**
 * #1843 (mobile review §5.5/§6.3) — the club page's panel shell.
 *
 * Below 768 a panel is a disclosure card, OPEN by default: the bordered
 * header becomes the `<summary>` (heading + meta + chevron, ≥ 44 px), so a
 * reader can fold a long panel away on a phone. At ≥ 768 the DOM is the
 * plain `.club-panel` (head + body), exactly as before. The section keeps
 * its accessible name (`aria-labelledby`) at every width.
 *
 * The open state is local: folding a card is not navigation, and the page's
 * URL already carries PY, date and the routed subpage (ADR-005).
 */
export function ClubPanel({
  titleId,
  title,
  icon,
  meta,
  className,
  children,
}: {
  /** DOM id of the heading; the section is labelled by it. */
  titleId: string
  title: string
  /** Decorative 16 px icon (aria-hidden by the caller). */
  icon?: React.ReactNode
  meta?: React.ReactNode
  /** Extra classes beside `club-panel` (e.g. `club-edu`). */
  className?: string
  children: React.ReactNode
}) {
  const isMobile = useIsMobile(768)
  const [open, setOpen] = useState(true)

  const heading = (
    <h2 id={titleId}>
      {icon}
      {title}
    </h2>
  )
  const metaEl = meta ? <span className="club-panel__meta">{meta}</span> : null
  const sectionClass = `club-panel${className ? ` ${className}` : ''}`

  if (!isMobile) {
    return (
      <section className={sectionClass} aria-labelledby={titleId}>
        <div className="club-panel__head">
          {heading}
          {metaEl}
        </div>
        <div className="club-panel__body">{children}</div>
      </section>
    )
  }

  return (
    <section
      className={`${sectionClass} club-panel--disclosure`}
      aria-labelledby={titleId}
    >
      <details open={open} onToggle={e => setOpen(e.currentTarget.open)}>
        <summary className="club-panel__head">
          {heading}
          {metaEl}
          <svg
            className="club-panel__chevron"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </summary>
        <div className="club-panel__body">{children}</div>
      </details>
    </section>
  )
}

export default ClubPanel
