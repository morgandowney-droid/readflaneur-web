'use client';

import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';

interface AboutContentProps {
  neighborhoodCount: number;
  cityCount: number;
  vacationCount: number;
}

export function AboutContent({ neighborhoodCount, cityCount, vacationCount }: AboutContentProps) {
  const { t } = useTranslation();

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-light tracking-wide mb-2">{t('about.title')}</h1>
        <div className="w-8 h-px bg-fg-subtle mb-8" />

        <section className="mb-12">
          <p className="text-sm text-fg-muted leading-relaxed mb-6">
            {t('about.intro1')}
          </p>
          <p className="text-sm text-fg-muted leading-relaxed mb-6">
            <em>{t('about.intro2')}</em>
          </p>
          <p className="text-sm text-fg-muted leading-relaxed">
            {t('about.intro3')}
          </p>
        </section>

        <section className="mb-12 pt-8 border-t border-border">
          <h2 className="text-lg font-medium mb-4">{t('about.whatWeCover')}</h2>
          <div className="grid grid-cols-2 gap-4 text-sm text-fg-muted">
            <div>
              <p className="font-medium mb-1">{t('about.dining')}</p>
              <p className="text-fg-subtle">{t('about.diningDesc')}</p>
            </div>
            <div>
              <p className="font-medium mb-1">{t('about.culture')}</p>
              <p className="text-fg-subtle">{t('about.cultureDesc')}</p>
            </div>
            <div>
              <p className="font-medium mb-1">{t('about.retail')}</p>
              <p className="text-fg-subtle">{t('about.retailDesc')}</p>
            </div>
            <div>
              <p className="font-medium mb-1">{t('about.realEstate')}</p>
              <p className="text-fg-subtle">{t('about.realEstateDesc')}</p>
            </div>
            <div>
              <p className="font-medium mb-1">{t('about.community')}</p>
              <p className="text-fg-subtle">{t('about.communityDesc')}</p>
            </div>
            <div>
              <p className="font-medium mb-1">{t('about.tonight')}</p>
              <p className="text-fg-subtle">{t('about.tonightDesc')}</p>
            </div>
          </div>
        </section>

        <section className="mb-12 pt-8 border-t border-border">
          <h2 className="text-lg font-medium mb-4">{t('about.ourCoverage')}</h2>
          <p className="text-sm text-fg-muted leading-relaxed mb-4">
            {t('about.coverageText')
              .replace('{neighborhoodCount}', String(neighborhoodCount))
              .replace('{cityCount}', String(cityCount))}
            {vacationCount > 0 && (
              <> {t('about.coverageVacation').replace('{vacationCount}', String(vacationCount))}</>
            )}
          </p>
          <p className="text-sm text-fg-muted leading-relaxed">
            {t('about.coverageFeed')}
          </p>
        </section>

        <section className="mb-12 pt-8 border-t border-border">
          <h2 className="text-lg font-medium mb-4">{t('about.communitySourced')}</h2>
          <p className="text-sm text-fg-muted leading-relaxed mb-4">
            {t('about.communitySourcedText')}
          </p>
          <Link
            href="/contact"
            className="inline-block text-xs tracking-widest uppercase border border-border-strong px-4 py-2 hover:bg-fg hover:text-canvas transition-colors"
          >
            {t('about.shareTip')}
          </Link>
        </section>

        <section className="mb-12 pt-8 border-t border-border">
          <h2 className="text-lg font-medium mb-4">{t('about.advertiseWithUs')}</h2>
          <p className="text-sm text-fg-muted leading-relaxed mb-4">
            {t('about.advertiseText')}
          </p>
          <Link
            href="/advertise"
            className="inline-block text-xs tracking-widest uppercase border border-border-strong px-4 py-2 hover:bg-fg hover:text-canvas transition-colors"
          >
            {t('about.learnMore')}
          </Link>
        </section>

        <section className="border-t border-border pt-8">
          <h2 className="text-lg font-medium mb-4">{t('about.contactTitle')}</h2>
          <p className="text-sm text-fg-muted mb-2">
            {t('about.generalInquiries')} <a href="mailto:contact@readflaneur.com" className="text-fg underline decoration-neutral-600 hover:text-fg">contact@readflaneur.com</a>
          </p>
          <p className="text-sm text-fg-muted mb-2">
            {t('about.advertising')} <a href="mailto:ads@readflaneur.com" className="text-fg underline decoration-neutral-600 hover:text-fg">ads@readflaneur.com</a>
          </p>
          <p className="text-sm text-fg-muted">
            {t('about.tips')} <a href="mailto:tips@readflaneur.com" className="text-fg underline decoration-neutral-600 hover:text-fg">tips@readflaneur.com</a>
          </p>
        </section>
      </div>
    </div>
  );
}
