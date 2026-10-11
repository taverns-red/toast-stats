import React from 'react'

/* #1832 — stub (red). */

export interface SectionBarItem {
  label: string
  to: string
  end?: boolean
  icon?: React.ReactNode
}

export interface SectionBarProps {
  label: string
  primary: readonly SectionBarItem[]
  more: readonly SectionBarItem[]
  testId?: string
}

export const SectionBar: React.FC<SectionBarProps> = () => null

export default SectionBar
