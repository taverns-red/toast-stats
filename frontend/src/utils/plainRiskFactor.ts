/* #2655 UNIT-21 — plain copy for the club page's risk factors. The messages
   come from analytics-core's classification (`ClubHealthAnalyticsModule`),
   written for a developer ("need 3+ to override"). They are rewritten here,
   so snapshots published before or after a copy change both read plainly; a
   message this does not recognise is shown as it came. */

const PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^Membership below 12 \(critical\)$/, () => 'Fewer than 12 members.'],
  [
    /^Net growth since July: (-?\d+) \(need 3\+ to override\)$/,
    m =>
      `Net membership change since July is ${m[1]}. It needs to reach +3 to lift the club out of this status.`,
  ],
  [
    /^Membership below threshold \((\d+) members?, need 20\+ or net growth 3\+\)$/,
    m =>
      `${m[1]} members. The club needs 20 or more, or a net gain of 3 since July.`,
  ],
  [
    /^DCP checkpoint not met: (\d+) goals? achieved, (\d+) required for (\w+)$/,
    m =>
      `${m[1]} ${m[1] === '1' ? 'goal' : 'goals'} met so far; ${m[2]} needed by ${m[3]}.`,
  ],
  [/^CSP not submitted$/, () => 'Club Success Plan not submitted.'],
]

export function plainRiskFactor(raw: string): string {
  for (const [pattern, write] of PATTERNS) {
    const match = raw.match(pattern)
    if (match) return write(match)
  }
  return raw
}
