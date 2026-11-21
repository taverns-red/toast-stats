import React from 'react'
import { Link } from 'react-router-dom'
import { useShellContext } from './AppShell/shellContext'
import type { RecoverySuggestion } from '../utils/errorRecovery'

interface NotFoundPanelProps {
  /** The h1: says which id or page was not found. */
  heading: string
  /** One or two sentences on what to do next. */
  message: string
  /** Lead-in above the chips; leave out with no suggestions. */
  suggestionsLead?: string
  suggestions?: readonly RecoverySuggestion[]
}

/** The not-found state for every unknown route or id, rendered in the shell. */
const NotFoundPanel: React.FC<NotFoundPanelProps> = ({
  heading,
  message,
  suggestionsLead,
  suggestions = [],
}) => {
  const shell = useShellContext()

  return (
    <div className="not-found-panel" data-testid="not-found-panel">
      <div className="not-found-panel__body">
        <h1 className="not-found-panel__heading">{heading}</h1>
        <p className="not-found-panel__message">{message}</p>

        {suggestions.length > 0 && (
          <nav aria-label="Suggested destinations">
            {suggestionsLead && (
              <p className="not-found-panel__lead">{suggestionsLead}</p>
            )}
            <ul className="not-found-panel__chips">
              {suggestions.map(({ label, to }) => (
                <li key={to}>
                  <Link to={to} className="not-found-panel__chip">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="not-found-panel__actions">
          <Link to="/" className="tm-btn-primary not-found-panel__action">
            Go to all districts
          </Link>
          {shell && (
            <button
              type="button"
              className="tm-btn-secondary not-found-panel__action"
              onClick={shell.openSearch}
            >
              Search districts and clubs
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default NotFoundPanel
