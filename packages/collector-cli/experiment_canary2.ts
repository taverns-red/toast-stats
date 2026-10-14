import { readFileSync } from 'node:fs'
import { scrubFacLocation } from './src/services/FacMeetingSchedule.js'
for (const d of process.argv.slice(3)) {
  const raw = JSON.parse(readFileSync(`${process.argv[2]}/d${d}.json`, 'utf-8'))
  for (const c of raw.Clubs ?? []) {
    const l = scrubFacLocation(c.Location)
    if (!l) continue
    for (const line of l.split('\n'))
      if (
        /contact|call|ask|text|whatsapp|wechat|@|mr\.|mrs\.|ms\.|dr\.|host|c\/o|attn|wa\b|line id|telegram|skype/i.test(
          line
        )
      )
        console.error(d, '|', line)
  }
}
