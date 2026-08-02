import React from 'react'
import { Link } from 'react-router-dom'

/* #577 — Back-to-district breadcrumb for routed district sub-pages.

   Epic #568's IA migration converts in-tab views into routed sub-pages
   (`/district/:id/clubs`, `/divisions`, `/rankings`, `/club/:cid`). Each
   loses a clickable way back up the hierarchy, because DistrictDetailHeader's
   own breadcrumb was removed in #442 (it collided with the AppShell's
   "Districts" nav on the *landing* page — a collision that does NOT exist on
   sub-pages, where the crumb reads "District 61 › Clubs", not the duplicate
   "Districts › District 61").

   This is the single source of that affordance. Sub-pages opt in; the bare
   district landing opts out (preserving #442). Phase 3 pages (#571) drop it
   in with one line. See tasks/lessons/ entry for #577.

   #1387 — why the crumb links are `inline-flex items-center`.

   `styles/layers/base.css` floors every `a[href]` at 44px min-height/min-width
   for WCAG 2.5.5, and `styles/responsive.css` bumps that to 48px from 1024px
   up. Each crumb `<a>` is a flex item of its `<li>`, so it is blockified and
   the floor applies: the anchor becomes a 48px-tall box whose 20px line box
   paints at the TOP. The `›` separators and the current-page crumb are plain
   spans — no floor, 21px tall — and `items-center` centres them in the 48px
   flex line. Result before the fix: labels at y=80, everything else at y=94,
   a row on two visual baselines.

   The fix makes the anchor centre its OWN content inside that inflated box.
   It must NOT shrink the box — the 44px target is a WCAG 2.5.5 requirement
   guarded by `e2e/touch-targets.smoke.ts`. Nothing about the box changes, so
   there is no layout shift; only the glyphs move within it.

   Same mechanism as the #1359 skeleton under-reserve: a 14px control whose
   BOX is silently 44px+. Proven in real pixels by
   `e2e/breadcrumb-alignment.smoke.ts`. */

export interface BreadcrumbCrumb {
  /** Visible text for the crumb. */
  label: string
  /** Target route. Omit on the final crumb to render it as the current page. */
  to?: string
  /** Optional React Router navigation state (e.g. filter round-trip). */
  state?: unknown
}

interface SubpageBreadcrumbProps {
  crumbs: BreadcrumbCrumb[]
}

export const SubpageBreadcrumb: React.FC<SubpageBreadcrumbProps> = ({
  crumbs,
}) => {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-4 font-tm-body text-sm"
      data-testid="subpage-breadcrumb"
    >
      <ol className="flex flex-wrap items-center gap-2">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <li key={`${crumb.label}-${i}`} className="flex items-center gap-2">
              {crumb.to ? (
                <Link
                  to={crumb.to}
                  state={crumb.state}
                  /* `inline-flex items-center` is the #1387 alignment fix, not
                     decoration. See the note above the component. */
                  className="text-tm-loyal-blue inline-flex items-center font-medium hover:underline"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className="font-medium text-gray-900 theme-dark:text-gray-100"
                  aria-current="page"
                >
                  {crumb.label}
                </span>
              )}
              {!isLast && (
                <span aria-hidden="true" className="text-gray-400">
                  ›
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
