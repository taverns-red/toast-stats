/* Region and world meeting-time heatmaps (#1814) — pure layer. Stub. */
import type { MeetingMode, MeetingSlot } from './meetingHeatmap'
import type { MeetingWeekday } from '@taverns-red/shared-contracts'

export interface MeetingTimesGridView {
  counts: number[][]
  noTime: number[]
  modeNotStated: number
}
export interface MeetingTimesDistrictView {
  id: string
  region: string | null
  clubs: number
  scheduled: number
  inPerson: number
  onlineCapable: number
  modes: Record<MeetingMode, MeetingTimesGridView>
}
export interface MeetingTimesView {
  snapshotDate: string
  programYear: string
  hasRegions: boolean
  regionMembershipNote: string | null
  districts: MeetingTimesDistrictView[]
  unreadable: string[]
}
export type MeetingTimesScope =
  | { kind: 'region'; regionId: string; district?: string | null }
  | { kind: 'world'; region?: string | null }
export interface ScopedMeetingTimes {
  scope: MeetingTimesScope
  districts: MeetingTimesDistrictView[]
  options: { id: string; label: string }[]
  filter: string | null
}
export interface MeetingTimesAggregate extends MeetingTimesGridView {
  clubs: number
  scheduled: number
  inPerson: number
  onlineCapable: number
  max: number
  eveningGaps: MeetingWeekday[]
}
export interface MeetingTimesChild {
  id: string
  label: string
  to: string | null
  clubs: number
  scheduled: number
  inPerson: number
  onlineCapable: number
  inSlot: number | null
}

export function parseMeetingTimes(_value: unknown): MeetingTimesView | null {
  throw new Error('not implemented (#1814)')
}
export function scopeMeetingTimes(
  _view: MeetingTimesView,
  _scope: MeetingTimesScope
): ScopedMeetingTimes {
  throw new Error('not implemented (#1814)')
}
export function aggregateMeetingTimes(
  _districts: readonly MeetingTimesDistrictView[],
  _mode: MeetingMode
): MeetingTimesAggregate {
  throw new Error('not implemented (#1814)')
}
export function meetingTimesChildren(
  _scoped: ScopedMeetingTimes,
  _mode: MeetingMode,
  _slot: MeetingSlot | null
): MeetingTimesChild[] {
  throw new Error('not implemented (#1814)')
}
