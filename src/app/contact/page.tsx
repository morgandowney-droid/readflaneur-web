'use client';

import Link from 'next/link';
import { NeighborhoodSuggestionForm } from '@/components/NeighborhoodSuggestionForm';
import { useTranslation } from '@/hooks/useTranslation';

export default function ContactPage() {
  const { t } = useTranslation();

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-light tracking-wide mb-8">{t('contact.title')}</h1>

        <p className="text-fg-muted mb-8">
          {t('contact.intro')}
        </p>

        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-medium mb-3">{t('contact.generalTitle')}</h2>
            <p className="text-sm text-fg-muted">
              {t('contact.generalText')}{' '}
              <a href="mailto:contact@readflaneur.com" className="text-fg underline decoration-neutral-600 hover:text-fg">
                contact@readflaneur.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium mb-3">{t('contact.tipsTitle')}</h2>
            <p className="text-sm text-fg-muted mb-3">
              {t('contact.tipsText')}
            </p>
            <p className="text-sm text-fg-muted">
              {t('contact.tipsEmail')}{' '}
              <a href="mailto:tips@readflaneur.com" className="text-fg underline decoration-neutral-600 hover:text-fg">
                tips@readflaneur.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium mb-3">{t('contact.suggestTitle')}</h2>
            <p className="text-sm text-fg-muted mb-4">
              {t('contact.suggestText')}
            </p>
            <NeighborhoodSuggestionForm variant="full" />
          </section>

          <section>
            <h2 className="text-lg font-medium mb-3">{t('contact.advertisingTitle')}</h2>
            <p className="text-sm text-fg-muted">
              {t('contact.advertisingText')}{' '}
              <Link href="/advertise" className="text-fg underline decoration-neutral-600 hover:text-fg">
                {t('contact.learnAboutAds')}
              </Link>{' '}
              {t('contact.orContact')}{' '}
              <a href="mailto:ads@readflaneur.com" className="text-fg underline decoration-neutral-600 hover:text-fg">
                ads@readflaneur.com
              </a>
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
