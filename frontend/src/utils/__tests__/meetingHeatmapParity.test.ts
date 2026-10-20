import { describe, it, expect } from 'vitest'
import { countMeetingSlots } from '@taverns-red/shared-contracts'
import fixture from '../../__tests__/fixtures/meeting-schedule-d61-2026-10-15.json'
import {
  MEETING_MODES,
  buildMeetingHeatmap,
  type MeetingClub,
} from '../meetingHeatmap'

/* #1814 — the district page's heatmap (#1796) and the pipeline's
   meeting-times.json must count with one rule, or a region grid (Σ its
   districts' pipeline counts) would disagree with the district pages it
   links to. The pipeline counts with shared-contracts' countMeetingSlots;
   this pins the page's buildMeetingHeatmap to it on the real D61
   2026-10-15 schedules, in every mode. */

const clubs = fixture.clubs as MeetingClub[]

describe('district heatmap = the pipeline rule (countMeetingSlots)', () => {
  for (const mode of MEETING_MODES) {
    it(`${mode}: same cells, no-time cells and KPIs`, () => {
      const page = buildMeetingHeatmap(clubs, mode)
      const pipeline = countMeetingSlots(clubs, mode)
      expect(pipeline.counts).toEqual(page.counts)
      expect(pipeline.noTime).toEqual(page.noTime)
      expect(pipeline.clubs).toBe(page.totalClubs)
      expect(pipeline.scheduled).toBe(page.scheduled)
      expect(pipeline.inPerson).toBe(page.inPerson)
      expect(pipeline.onlineCapable).toBe(page.onlineCapable)
      expect(pipeline.modeNotStated).toBe(page.modeNotStated.length)
    })
  }
})
