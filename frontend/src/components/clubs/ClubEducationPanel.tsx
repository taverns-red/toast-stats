import { ClubPanel } from './ClubPanel'
import type {
  ClubEducationSummary,
  EducationProgram,
} from '../../utils/clubEducation'

/**
 * #1790 — Education panel on the club page (ledger only, epic #1781).
 *
 * Mobile-first: one column of label/value pairs and labelled bars at 375 px;
 * every number is printed next to its label, so nothing depends on bar
 * length, colour or a hover tooltip. Bars are decoration (aria-hidden).
 * Shares the `.club-panel` chrome; inner pieces are `.club-edu*` with
 * `--rt-*` tokens (app-shell.css).
 */
const PROGRAMS: EducationProgram[] = ['Pathways', 'Legacy', 'DTM']

const PROGRAM_CLASS: Record<EducationProgram, string> = {
  Pathways: 'club-edu__seg--pathways',
  Legacy: 'club-edu__seg--legacy',
  DTM: 'club-edu__seg--dtm',
}

export function ClubEducationPanel({
  summary,
  programYearLabel,
}: {
  summary: ClubEducationSummary
  /** The page's program year (R3), e.g. "2026-2027". */
  programYearLabel: string
}) {
  const pyDisplay = programYearLabel.replace(/-/g, '–')
  const meta = !summary.available
    ? null
    : summary.isArchive
      ? 'Year-end archive'
      : summary.asOf
        ? `Ledger as of ${summary.asOf}`
        : null

  return (
    <ClubPanel
      titleId="club-edu-title"
      title="Education"
      className="club-edu"
      meta={meta}
      icon={
        <svg
          className="club-panel__ico"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          aria-hidden="true"
        >
          <path d="M1.5 6L8 3l6.5 3L8 9 1.5 6z" />
          <path d="M4 7.5V11c1.2 1 2.6 1.5 4 1.5s2.8-.5 4-1.5V7.5" />
        </svg>
      }
    >
      {!summary.available ? (
        <p className="club-edu__note">
          Education awards are not available for this date.
        </p>
      ) : (
        <>
          <dl className="club-edu__kpis">
            <div className="club-edu__kpi">
              <dt>Awards</dt>
              <dd className="tabular-nums">{summary.total}</dd>
            </div>
            <div className="club-edu__kpi">
              <dt>Members with an award</dt>
              <dd className="tabular-nums">
                {summary.membersWithAward ?? '—'}
              </dd>
            </div>
            <div className="club-edu__kpi">
              <dt>DTMs</dt>
              <dd className="tabular-nums">{summary.byProgram.DTM}</dd>
            </div>
          </dl>

          {summary.total === 0 ? (
            <p className="club-edu__note">
              No education awards recorded in {pyDisplay}
              {summary.isArchive ? '.' : ' yet.'}
            </p>
          ) : (
            <>
              <div className="club-edu__stack" aria-hidden="true">
                {PROGRAMS.filter(p => summary.byProgram[p] > 0).map(p => (
                  <span
                    key={p}
                    className={`club-edu__seg ${PROGRAM_CLASS[p]}`}
                    style={{ flexGrow: summary.byProgram[p] }}
                  />
                ))}
              </div>
              <ul className="club-edu__legend" aria-label="Awards by program">
                {PROGRAMS.filter(p => summary.byProgram[p] > 0).map(p => (
                  <li key={p}>
                    <span
                      className={`club-edu__swatch ${PROGRAM_CLASS[p]}`}
                      aria-hidden="true"
                    />
                    {p}{' '}
                    <span className="tabular-nums">{summary.byProgram[p]}</span>
                  </li>
                ))}
              </ul>

              <h3 className="club-edu__subhead">Pathways levels</h3>
              <ul
                className="club-edu__levels"
                aria-label="Pathways awards by level"
              >
                {summary.pathwaysLevels.map((count, i) => {
                  const max = Math.max(...summary.pathwaysLevels, 1)
                  return (
                    <li key={i} className="club-edu__level">
                      <span className="club-edu__level-lab">Level {i + 1}</span>{' '}
                      <span className="club-edu__bar" aria-hidden="true">
                        <span
                          className="club-edu__bar-fill"
                          style={{ width: `${(count / max) * 100}%` }}
                        />
                      </span>
                      <span className="club-edu__level-val tabular-nums">
                        {count}
                      </span>
                    </li>
                  )
                })}
              </ul>

              {summary.paths.length > 0 && (
                <>
                  <h3 className="club-edu__subhead">Paths</h3>
                  <ul className="club-edu__paths" aria-label="Paths">
                    {summary.paths.map(p => (
                      <li key={p.code}>
                        {p.name} <span className="tabular-nums">{p.count}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </>
      )}
    </ClubPanel>
  )
}
