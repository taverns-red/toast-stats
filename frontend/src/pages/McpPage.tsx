import React, { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useIsMobile } from '../hooks/useIsMobile'
import CollapsibleSection from '../components/CollapsibleSection'

/* MCP Server page (#1165, epic #1162). The public announcement surface for
   the published @taverns-red/toast-stats-mcp package: what it is, how to
   install it, the eight read-only tools, and the freshness/provenance
   caveats. Authored against the package README (packages/mcp-server) and
   ADR-008 as the sources of truth — keep the install snippets in sync with
   the README's Install section (one story, per the #1165 operator ruling).

   Doc-style route in the Methodology family: same section chrome
   (CollapsibleSection — collapses per-section on mobile, static on desktop),
   same lede pattern. Fully static content — no data fetch, so there are no
   null-until-data sections and the page is CLS-safe by construction. */

const PACKAGE_NAME = '@taverns-red/toast-stats-mcp'

const TOOLS: ReadonlyArray<{ name: string; purpose: string }> = [
  {
    name: 'get-latest-date',
    purpose: 'Most recent published snapshot date.',
  },
  {
    name: 'list-dates',
    purpose: 'Every available snapshot date.',
  },
  {
    name: 'list-districts',
    purpose: 'District ids with snapshots, and the dates each has.',
  },
  {
    name: 'resolve-club',
    purpose:
      'Which district a club id belongs to. Unknown club → not available, never guessed.',
  },
  {
    name: 'get-district-snapshot',
    purpose:
      'Full per-district snapshot (roster, division/area aggregates, totals) for a date.',
  },
  {
    name: 'query-rankings',
    purpose:
      'All-districts rankings — ranks, paid clubs, payments, distinguished tiers.',
  },
  {
    name: 'get-club-health',
    purpose:
      'Raw per-club health-signal fields (membership, base, renewals, DCP goals, status), optionally filtered to one division.',
  },
  {
    name: 'get-time-series',
    purpose:
      'Pre-computed program-year time series for a district — membership, payments, DCP, distinguished, club-health counts.',
  },
]

const CLAUDE_CODE_SNIPPET = `claude mcp add toast-stats -- npx -y ${PACKAGE_NAME}`

const JSON_CONFIG_SNIPPET = `{
  "mcpServers": {
    "toast-stats": {
      "command": "npx",
      "args": ["-y", "${PACKAGE_NAME}"]
    }
  }
}`

const SECTIONS: ReadonlyArray<{ id: string; num: string; title: string }> = [
  { id: 'what-it-is', num: '01', title: 'What it is' },
  { id: 'install', num: '02', title: 'Install' },
  { id: 'tools', num: '03', title: 'The eight tools' },
  { id: 'freshness', num: '04', title: 'Data freshness & provenance' },
  { id: 'developers', num: '05', title: 'For developers' },
]

const McpPage: React.FC = () => {
  useDocumentTitle('MCP Server')

  // Same mobile pattern as /methodology (#877): each section collapses behind
  // a disclosure on <768px; desktop renders the full static page. This page is
  // short enough that open-state is plain local state — no URL round-trip.
  const isMobile = useIsMobile()
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set())
  const toggle = useCallback((id: string) => {
    setOpenIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const sectionProps = (id: string) => ({
    id,
    num: SECTIONS.find(s => s.id === id)?.num ?? '',
    title: SECTIONS.find(s => s.id === id)?.title ?? '',
    collapsible: isMobile,
    open: openIds.has(id),
    onToggle: toggle,
  })

  return (
    <div className="methodology-page mcp-page">
      <header className="methodology-page__header">
        <p className="placeholder-page__eyebrow">AI access · MCP</p>
        <h1 className="placeholder-page__title">MCP Server</h1>
        <p className="long-text-lede" data-testid="mcp-lede">
          Ask Claude (or any MCP-capable client) about district performance,
          grounded in the same public data this site renders — a local,
          read-only server you install with one command.
        </p>
      </header>

      <CollapsibleSection {...sectionProps('what-it-is')}>
        <p>
          <code>{PACKAGE_NAME}</code> is a thin, local, read-only{' '}
          <a
            href="https://modelcontextprotocol.io"
            target="_blank"
            rel="noopener noreferrer"
            className="methodology-link"
          >
            Model Context Protocol
          </a>{' '}
          server over the public Toast Stats snapshot CDN. It gives an AI client
          eight read-only tools over the <em>pre-computed</em> snapshots this
          site renders — so its answers cite the same numbers you see here.
        </p>
        <p>It is deliberately thin:</p>
        <ul>
          <li>
            <strong>Read-only, no computation.</strong> Tools fetch CDN JSON,
            validate it, and return fields. They never derive a tier, threshold,
            or recognition state.
          </li>
          <li>
            <strong>Not available, never guess.</strong> If a question needs
            something a snapshot doesn&apos;t already contain, the tool returns
            a structured <em>not available</em> — it never fabricates.
          </li>
          <li>
            <strong>Local only.</strong> Runs on your machine over stdio. No
            hosting, no account, no auth — the data is public.
          </li>
          <li>
            <strong>Cites its source.</strong> Every response carries the exact
            CDN <code>sourceUrl</code> it read and the snapshot{' '}
            <code>date</code>, so any answer is verifiable against this site.
          </li>
        </ul>
      </CollapsibleSection>

      <CollapsibleSection {...sectionProps('install')}>
        <p>
          Requires <strong>Node.js 22+</strong>. For{' '}
          <strong>Claude Code</strong>, one command:
        </p>
        <pre className="mcp-page__snippet">
          <code>{CLAUDE_CODE_SNIPPET}</code>
        </pre>
        <p>
          For <strong>Claude Desktop</strong> (
          <code>claude_desktop_config.json</code>) or any other MCP-capable
          client, add an <code>mcpServers</code> entry:
        </p>
        <pre className="mcp-page__snippet">
          <code>{JSON_CONFIG_SNIPPET}</code>
        </pre>
        <p>
          Restart the client and the <code>toast-stats</code> tools below become
          available. The package is published on{' '}
          <a
            href={`https://www.npmjs.com/package/${PACKAGE_NAME}`}
            target="_blank"
            rel="noopener noreferrer"
            className="methodology-link"
          >
            npm
          </a>
          .
        </p>
      </CollapsibleSection>

      <CollapsibleSection {...sectionProps('tools')}>
        <p>
          All eight tools are read-only and return a JSON envelope citing the
          CDN URL and snapshot date they read.
        </p>
        <dl className="methodology-glossary">
          {TOOLS.map(t => (
            <React.Fragment key={t.name}>
              <dt>
                <code>{t.name}</code>
              </dt>
              <dd>{t.purpose}</dd>
            </React.Fragment>
          ))}
        </dl>
      </CollapsibleSection>

      <CollapsibleSection {...sectionProps('freshness')}>
        <ul>
          <li>
            <strong>Refresh cadence.</strong> The data pipeline runs once daily
            (~09:15 UTC); the server reads whatever snapshot is currently
            published. Answers are as-of the snapshot <code>date</code> they
            cite — not real time.
          </li>
          <li>
            <strong>Closing periods & restatements.</strong> Toastmasters
            occasionally republishes corrected files, and month-end results
            settle over a few days. Recent values can restate; the cited
            snapshot date tells you exactly which day&apos;s data an answer
            used.
          </li>
          <li>
            <strong>Provenance.</strong> Every response carries the exact CDN{' '}
            <code>sourceUrl</code> it read, so you can verify any number against
            the live site or the raw JSON.
          </li>
        </ul>
        <p className="methodology-source">
          How the numbers themselves are computed — rankings, DCP tiers, club
          health — is documented on{' '}
          <Link to="/methodology" className="methodology-link">
            How it works
          </Link>
          .
        </p>
      </CollapsibleSection>

      <CollapsibleSection {...sectionProps('developers')}>
        <p>
          The server is MIT-licensed and lives in the{' '}
          <a
            href="https://github.com/taverns-red/toast-stats/tree/main/packages/mcp-server"
            target="_blank"
            rel="noopener noreferrer"
            className="methodology-link"
          >
            Toast Stats GitHub repo
          </a>{' '}
          (<code>packages/mcp-server</code>) — the README covers the
          clone-and-build development path, the offline smoke tests, and the
          response envelope. The design rationale (why a thin read-only server,
          why no computation) is{' '}
          <a
            href="https://github.com/taverns-red/toast-stats/blob/main/docs/architecture-decisions/008-ai-enable-toast-stats.md"
            target="_blank"
            rel="noopener noreferrer"
            className="methodology-link"
          >
            ADR-008
          </a>
          .
        </p>
      </CollapsibleSection>
    </div>
  )
}

export default McpPage
