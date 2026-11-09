import React from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { openConsentSettings } from '../utils/consent'

/* Privacy and cookies note (#2584): what each choice stores, in plain
   language. Linked from the consent banner and the footer. The consent
   cookie is shared across *.taverns.red (ops#319). */

const PrivacyPage: React.FC = () => {
  useDocumentTitle('Privacy and cookies')
  return (
    <div className="methodology-page">
      <header className="methodology-page__header">
        <p className="placeholder-page__eyebrow">Help · Privacy</p>
        <h1 className="placeholder-page__title">Privacy and cookies</h1>
        <p className="long-text-lede">
          Toast Stats has no accounts and collects no names or emails. You
          choose how much it may remember. Nothing beyond your choice is saved
          until you make one.
        </p>
        <p>
          <button
            type="button"
            className="consent-reopen"
            onClick={openConsentSettings}
          >
            Change my choice
          </button>
        </p>
      </header>

      <section
        className="methodology-section"
        aria-labelledby="privacy-all"
        data-testid="privacy-all"
      >
        <h2 id="privacy-all" className="methodology-section__title">
          Keep all
        </h2>
        <p>
          Google Analytics counts visits and pages viewed so we can see what is
          useful. It sets analytics cookies (names starting with{' '}
          <code>_ga</code>) on <code>.taverns.red</code>, and sends an
          anonymised address and the page you viewed to Google. Ad
          personalisation is off. The site also remembers your preferences on
          this device, such as light or dark theme, your district and table
          filters.
        </p>
      </section>

      <section
        className="methodology-section"
        aria-labelledby="privacy-minimal"
        data-testid="privacy-minimal"
      >
        <h2 id="privacy-minimal" className="methodology-section__title">
          Keep minimal
        </h2>
        <p>
          The site remembers your preferences on this device (theme, your
          district, table filters). Google Analytics never loads, and nothing is
          sent to Google.
        </p>
      </section>

      <section
        className="methodology-section"
        aria-labelledby="privacy-none"
        data-testid="privacy-none"
      >
        <h2 id="privacy-none" className="methodology-section__title">
          Keep none
        </h2>
        <p>
          No analytics and no saved preferences. Your theme and filters last
          only while this tab is open, then they are forgotten.
        </p>
      </section>

      <section
        className="methodology-section"
        aria-labelledby="privacy-choice"
        data-testid="privacy-choice"
      >
        <h2 id="privacy-choice" className="methodology-section__title">
          The choice itself
        </h2>
        <p>
          Every choice, including none, stores one small cookie so we do not ask
          again on every page. It is strictly necessary, and it is the only
          thing stored under &ldquo;none&rdquo;.
        </p>
        <ul>
          <li>
            Name: <code>rt_consent</code>
          </li>
          <li>
            Value: <code>v1.all</code>, <code>v1.minimal</code> or{' '}
            <code>v1.none</code> (the <code>v1</code> is the version of this
            policy; if it changes we ask again)
          </li>
          <li>
            Scope: <code>.taverns.red</code>, so Red Taverns sites share it and
            you answer once. Lasts 12 months.
          </li>
        </ul>
        <p>
          Moving to a lower choice stops Google Analytics for the rest of your
          visit and deletes its cookies.
        </p>
      </section>
    </div>
  )
}

export default PrivacyPage
