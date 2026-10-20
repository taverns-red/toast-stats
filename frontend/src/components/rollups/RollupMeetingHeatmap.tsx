import React from 'react'
import type { MeetingMode, MeetingSelection } from '../../utils/meetingHeatmap'
import type { ScopedMeetingTimes } from '../../utils/meetingTimesRollup'

/* Region and world meeting-time heatmap body (#1814). Stub. */
export interface RollupMeetingHeatmapProps {
  scoped: ScopedMeetingTimes
  unreadable: readonly string[]
  mode: MeetingMode
  selection: MeetingSelection | null
}

export const RollupMeetingHeatmap: React.FC<RollupMeetingHeatmapProps> = () =>
  null

export default RollupMeetingHeatmap
