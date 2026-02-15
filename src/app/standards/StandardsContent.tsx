'use client';

import { useTranslation } from '@/hooks/useTranslation';

export function StandardsContent() {
  const { t } = useTranslation();

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-light tracking-wide mb-8">
          {t('standards.title')}
        </h1>

        <p className="text-fg-muted mb-8">
          {t('standards.intro')}
        </p>

        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-medium mb-3">{t('standards.textTitle')}</h2>
            <p className="text-sm text-fg-muted mb-3">
              {t('standards.textIntro')}
            </p>
            <ul className="space-y-3 text-sm text-fg-muted">
              <li>
                <strong className="text-fg">{t('standards.synthesizedTag')}</strong>{' '}
                {t('standards.synthesizedTagText')}
              </li>
              <li>
                <strong className="text-fg">{t('standards.sourcingProtocol')}</strong>{' '}
                {t('standards.sourcingProtocolText')}
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium mb-3">{t('standards.visualTitle')}</h2>
            <p className="text-sm text-fg-muted mb-3">
              {t('standards.visualIntro')}
            </p>
            <ul className="space-y-3 text-sm text-fg-muted">
              <li>
                <strong className="text-fg">{t('standards.dramatization')}</strong>{' '}
                {t('standards.dramatizationText')}
              </li>
              <li>
                <strong className="text-fg">{t('standards.badging')}</strong>{' '}
                {t('standards.badgingText')}
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium mb-3">{t('standards.provenanceTitle')}</h2>
            <p className="text-sm text-fg-muted mb-3">
              {t('standards.provenanceIntro')}
            </p>
            <ul className="space-y-3 text-sm text-fg-muted">
              <li>
                <strong className="text-fg">{t('standards.credentials')}</strong>{' '}
                {t('standards.credentialsText')}
              </li>
              <li>
                <strong className="text-fg">{t('standards.fingerprint')}</strong>{' '}
                {t('standards.fingerprintText')}
              </li>
            </ul>
          </section>

          <section className="pt-8 border-t border-border">
            <p className="text-sm text-fg-subtle">
              {t('standards.effectiveDate')}
            </p>
            <p className="text-sm text-fg-subtle mt-2">
              {t('standards.questions')}{' '}
              <a href="mailto:ethics@readflaneur.com" className="text-fg underline decoration-neutral-600 hover:text-fg">
                ethics@readflaneur.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
