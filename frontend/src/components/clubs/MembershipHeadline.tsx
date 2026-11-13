import React from 'react'

/**
 * The collapsed membership trend's headline on the club page: "11 members (-5)".
 *
 * (#2712) The basis the change is measured against belongs here too, but it
 * is read out, not drawn. This span is the page's Largest Contentful Paint
 * candidate on phones: spelling the basis out in the visible text made it wrap
 * to two lines, overtook the hero's meeting line as the LCP element, and
 * pushed LCP past its 3800 ms budget. The visible basis sits one tap away, in
 * the expanded panel's "Change" row, and in the stat strip above.
 */
export const MembershipHeadline: React.FC<{
  latest: number
  change: number
  /** e.g. "since the start of the program year" — from `netChangeBasis`. */
  basis: string
}> = ({ latest, change, basis }) => (
  <>
    {latest} members
    {change !== 0 && ` (${change > 0 ? '+' : ''}${change} ${basis})`}
  </>
)
