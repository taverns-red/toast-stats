/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react'
import { ProgramYear } from '../utils/programYear'
import { useDefaultProgramYear } from '../hooks/useDefaultProgramYear'

/** localStorage key older builds persisted the selected year under (#1618). */
const LEGACY_STORAGE_KEY = 'selectedProgramYear'

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

  // The in-session selection, or null when nothing has selected a year yet.
  // It is deliberately NOT persisted across visits (#1618): every writer of
  // this state — the picker, the `?py=` URL sync, the self-heal — used to
  // write localStorage, so one visit to a `?py=2025` link pinned PY 2025-26 as
  // the default for every later visit, long after PY 2026-27 published. A
  // persisted year always goes stale at the rollover; the URL (`?py=`) is the
  // durable, shareable carrier of a non-default year.
  const [explicitProgramYear, setExplicitProgramYear] =
    useState<ProgramYear | null>(null)

  // Drop the key earlier builds persisted, so visitors already pinned to a
  // stale year are released rather than carrying it forever.
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // Storage can be unavailable (private mode); nothing to clean up then.
    }
  }, [])

  // Effective selection: an in-session choice wins; otherwise the data-driven
  // default (which advances automatically as new program years publish).
  const selectedProgramYear = explicitProgramYear ?? defaultProgramYear

  const setSelectedProgramYear = useCallback((programYear: ProgramYear) => {
    setExplicitProgramYear(programYear)
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
