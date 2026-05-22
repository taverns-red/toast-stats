import React from 'react'

/* #572 — stub. Implementation lands in the green commit. */

export interface AnchorSection {
  id: string
  label: string
}

export interface DistrictAnchorTocProps {
  sections: AnchorSection[]
}

export const DistrictAnchorToc: React.FC<DistrictAnchorTocProps> = () => null
