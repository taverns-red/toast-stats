import { MobileDisclosure } from '../MobileDisclosure'

/**
 * #1843 (mobile review §6.3) — the club stat strip: 2×2 at 375, 4×2 from
 * 768. Cells are ≥ 56 px with a 12 px uppercase label (the one place the
 * review allows 12 px) and a display-face value.
 *
 * Below 768 the first four cells are the strip. The rest fold behind one
 * disclosure whose open state is URL state (`?stats=1`), so every number
 * stays one tap away. At ≥ 768 `MobileDisclosure` renders its children
 * bare, so all cells are direct grid children and the 4×2 grid is intact.
 *
 * Value colour is a `--pos/--neg/--muted/--tick/--cross` modifier, so the
 * dark-mode override lives in CSS (R10); Net Δ and CSP keep a sign or a
 * ✓/✗ glyph so colour is never the only signal.
 */
export interface ClubStat {
  label: string
  value: string | number
  valClass?: '' | 'pos' | 'neg' | 'muted' | 'tick' | 'cross'
  title?: string
}

const PRIMARY = 4

function Cell({ stat }: { stat: ClubStat }) {
  return (
    <div className="club-stat" title={stat.title}>
      <div className="club-stat__label">{stat.label}</div>
      <div
        className={`club-stat__val tabular-nums${
          stat.valClass ? ` club-stat__val--${stat.valClass}` : ''
        }`}
      >
        {stat.value}
      </div>
    </div>
  )
}

export function ClubStatStrip({
  stats,
  moreLabel = 'Renewals, new members and CSP',
}: {
  stats: ClubStat[]
  /** Summary of the folded cells on phones. */
  moreLabel?: string
}) {
  const primary = stats.slice(0, PRIMARY)
  const rest = stats.slice(PRIMARY)
  return (
    <div className="club-stats-grid">
      {primary.map(stat => (
        <Cell key={stat.label} stat={stat} />
      ))}
      {rest.length > 0 && (
        <MobileDisclosure summaryLabel={moreLabel} urlParam="stats">
          {rest.map(stat => (
            <Cell key={stat.label} stat={stat} />
          ))}
        </MobileDisclosure>
      )}
    </div>
  )
}

export default ClubStatStrip
