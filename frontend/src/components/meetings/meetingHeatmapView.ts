/* View helpers for the meeting-time heatmaps (#1796, #1814): labels, the
   URL-param link builder and selection guards, shared by the district and
   region/world bodies. */
import { useSearchParams } from 'react-router-dom'
import {
  MEETING_MODE_LABELS,
  hourRangeLabel,
  type MeetingMode,
  type MeetingSelection,
  type MeetingSlot,
} from '../../utils/meetingHeatmap'

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const pad = (h: number) => String(h).padStart(2, '0')
export const clubsText = (n: number) =>
  n === 0 ? 'no clubs' : n === 1 ? '1 club' : `${n.toLocaleString()} clubs`

/** A link to the current URL with one param set (null = removed). */
export function useParamHref(): (key: string, value: string | null) => string {
  const [params] = useSearchParams()
  return (key, value) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    const s = next.toString()
    return s ? `?${s}` : '?'
  }
}

export const isSlot = (s: MeetingSelection | null): s is MeetingSlot =>
  s !== null && typeof s === 'object'

export const sameSlot = (a: MeetingSelection | null, b: MeetingSlot) =>
  isSlot(a) && a.day === b.day && a.hour === b.hour

export function slotTitle(slot: MeetingSlot): string {
  return slot.hour === null
    ? `${slot.day}, time not stated`
    : `${slot.day} ${hourRangeLabel(slot.hour)}`
}

export const modeSuffixOf = (mode: MeetingMode) =>
  mode === 'all' ? '' : ` (${MEETING_MODE_LABELS[mode].toLowerCase()})`
