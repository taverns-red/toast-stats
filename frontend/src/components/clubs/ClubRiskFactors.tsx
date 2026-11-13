import { plainRiskFactor } from '../../utils/plainRiskFactor'

/* #2655 UNIT-21 — the club page's Risk factors, as a regular club panel with
   a red left rule and plain copy (`plainRiskFactor` rewrites the analytics
   messages). */

export function ClubRiskFactors({ factors }: { factors: readonly string[] }) {
  if (factors.length === 0) return null
  return (
    <section className="club-panel club-risk" aria-labelledby="club-risk-title">
      <div className="club-panel__head">
        <h2 id="club-risk-title">Risk factors</h2>
      </div>
      <div className="club-panel__body">
        <ul className="club-risk__list">
          {factors.map(factor => (
            <li key={factor}>{plainRiskFactor(factor)}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
