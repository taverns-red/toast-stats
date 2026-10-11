import type React from 'react'
import type { ProgramYear } from '../utils/programYear'

/* #1831 red stub — implemented in the next commit. */
export interface ContextCrumb {
  label: string
  to?: string
}

export interface ContextBarProps {
  title: string
  back?: { label: string; to: string } | undefined
  programYear: ProgramYear
  date?: string | undefined
  controls?: React.ReactNode
  actions?: React.ReactNode
  about?: React.ReactNode
  trail?: ContextCrumb[]
}

export const formatPyCompact = (py: ProgramYear): string => String(py.year)

export const ContextBar: React.FC<ContextBarProps> = () => null
