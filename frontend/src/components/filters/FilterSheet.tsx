import React from 'react'

export interface FilterSheetOption {
  value: string
  label: string
}

export interface FilterSheetFacet {
  id: string
  label: string
  options: FilterSheetOption[]
  selected: string[]
  onChange: (next: string[]) => void
}

export interface FilterSheetSort {
  options: FilterSheetOption[]
  field: string
  direction: 'asc' | 'desc'
  onChange: (field: string, direction: 'asc' | 'desc') => void
}

export interface FilterSheetProps {
  isOpen: boolean
  onClose: () => void
  resultCount: number
  resultNoun: { one: string; other: string }
  activeCount: number
  onClearAll: () => void
  sort?: FilterSheetSort
  facets: FilterSheetFacet[]
  id?: string
}

export const FilterSheet: React.FC<FilterSheetProps> = () => null

export default FilterSheet
