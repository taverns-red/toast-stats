import { readFileSync } from 'node:fs'
import { MeetingScheduleEntrySchema } from '@taverns-red/shared-contracts'
import { normaliseTiClub } from './src/services/FindAClubService.js'
const dir = process.argv[2]
let tot = 0,
  withDay = 0,
  sched = 0,
  withTime = 0,
  withMode = 0,
  withCad = 0,
  loc = 0,
  bytes = 0,
  invalid = 0,
  leaks = 0
const unparsed: string[] = []
const modes: Record<string, number> = {}
for (const d of process.argv.slice(3)) {
  const raw = JSON.parse(readFileSync(`${dir}/d${d}.json`, 'utf-8'))
  for (const c of raw.Clubs ?? []) {
    const e = normaliseTiClub(c)
    if (!e) continue
    tot++
    if (c.MeetingDay) withDay++
    if (e.location) {
      loc++
      if (
        /@|https?:|www\.|zoom\.us|pwd|passcode/i.test(e.location) ||
        (e.location.match(/\+?\(?\d[\d ().-]*\d/g) ?? []).some(
          r => r.replace(/\D/g, '').length >= 7
        )
      ) {
        leaks++
        console.error('LEAK?', d)
      }
    }
    if (e.meetingSchedule) {
      sched++
      if (e.meetingSchedule.some(x => x.startTime)) withTime++
      if (e.meetingSchedule.some(x => x.mode)) withMode++
      if (e.meetingSchedule.every(x => x.cadence)) withCad++
      for (const x of e.meetingSchedule) {
        if (!MeetingScheduleEntrySchema.safeParse(x).success) invalid++
        modes[x.mode ?? 'none'] = (modes[x.mode ?? 'none'] ?? 0) + 1
      }
    } else if (c.MeetingDay) unparsed.push(`${d}: ${c.MeetingDay}`)
    bytes +=
      JSON.stringify({
        location: e.location,
        meetingSchedule: e.meetingSchedule,
      }).length - 2
  }
}
console.error(
  JSON.stringify({
    tot,
    withDay,
    sched,
    withTime,
    withMode,
    withCad,
    loc,
    leaks,
    invalid,
    bytesPerClub: +(bytes / tot).toFixed(1),
    modes,
  })
)
console.error('unparsed sample:', unparsed.slice(0, 40))
