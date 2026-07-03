/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react'
import { logger } from '../utils/logger'
import { ProgramYear, getProgramYear } from '../utils/programYear'
import { useDefaultProgramYear } from '../hooks/useDefaultProgramYear'

interface ProgramYearContextType {
  selectedProgramYear: ProgramYear
  setSelectedProgramYear: (programYear: ProgramYear) => void
  selectedDate: string | undefined
  setSelectedDate: (date: string | undefined) => void
}

const ProgramYearContext = createContext<ProgramYearContextType | undefined>(
  undefined
)

interface ProgramYearProviderProps {
  children: ReactNode
}

export const ProgramYearProvider: React.FC<ProgramYearProviderProps> = ({
  children,
}) => {
  // The DATA-DRIVEN default program year: the latest PY that has snapshots,
  // falling back to the calendar PY only while data loads (#1300). Self-heals
  // as new data publishes.
  const defaultProgramYear = useDefaultProgramYear()

  // The user's EXPLICIT selection (persisted from a prior UI choice), or null
  // when they've made none. Only explicit choices are persisted; the
  // auto-adopted default is NEVER written to localStorage, so the effective
  // default can advance with the data instead of being frozen at first visit.
  const [explicitProgramYear, setExplicitProgramYear] =
    useState<ProgramYear | null>(() => {
      const savedYear = localStorage.getItem('selectedProgramYear')
      if (savedYear) {
        const year = parseInt(savedYear, 10)
        if (!Number.isNaN(year)) {
          return getProgramYear(year)
        }
        logger.error('Failed to load saved program year:', savedYear)
      }
      return null
    })

  // Effective selection: explicit user choice wins; otherwise the data-driven
  // default (which advances automatically as new program years publish).
  const selectedProgramYear = explicitProgramYear ?? defaultProgramYear

  const setSelectedProgramYear = useCallback((programYear: ProgramYear) => {
    setExplicitProgramYear(programYear)
    localStorage.setItem('selectedProgramYear', programYear.year.toString())
  }, [])

  const [selectedDate, setSelectedDate] = useState<string | undefined>(
    undefined
  )

  const value: ProgramYearContextType = {
    selectedProgramYear,
    setSelectedProgramYear,
    selectedDate,
    setSelectedDate,
  }

  return (
    <ProgramYearContext.Provider value={value}>
      {children}
    </ProgramYearContext.Provider>
  )
}

export const useProgramYear = (): ProgramYearContextType => {
  const context = useContext(ProgramYearContext)
  if (context === undefined) {
    throw new Error('useProgramYear must be used within a ProgramYearProvider')
  }
  return context
}
