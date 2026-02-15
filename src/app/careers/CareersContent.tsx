'use client';

import { useTranslation } from '@/hooks/useTranslation';

export function CareersContent() {
  const { t } = useTranslation();

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-12">
          <p className="text-xs tracking-[0.3em] uppercase text-fg-muted mb-4">
            {t('careers.joinFlaneur')}
          </p>
          <h1 className="text-4xl font-light leading-tight mb-6">
            {t('careers.title')}
          </h1>
          <p className="text-lg text-fg-muted">
            {t('careers.subtitle')}
          </p>
        </div>

        {/* About */}
        <section className="mb-12">
          <p className="text-fg-muted leading-relaxed mb-6">
            {t('careers.aboutIntro')}
          </p>
          <p className="text-fg-muted leading-relaxed">
            {t('careers.aboutRole')}
          </p>
        </section>

        {/* The Role */}
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.2em] uppercase text-fg-muted mb-4">
            {t('careers.theRole')}
          </h2>
          <div className="bg-surface border border-border p-6">
            <p className="text-fg-muted leading-relaxed italic">
              {t('careers.roleQuote')}
            </p>
          </div>
        </section>

        {/* What You Will Do */}
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.2em] uppercase text-fg-muted mb-4">
            {t('careers.whatYouWillDo')}
          </h2>
          <ul className="space-y-4">
            <li className="flex gap-4">
              <span className="text-fg-muted font-light">01</span>
              <div>
                <p className="font-medium mb-1">{t('careers.walkBeat')}</p>
                <p className="text-sm text-fg-muted">
                  {t('careers.walkBeatDesc')}
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="text-fg-muted font-light">02</span>
              <div>
                <p className="font-medium mb-1">{t('careers.spotDetails')}</p>
                <p className="text-sm text-fg-muted">
                  {t('careers.spotDetailsDesc')}
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="text-fg-muted font-light">03</span>
              <div>
                <p className="font-medium mb-1">{t('careers.snapSend')}</p>
                <p className="text-sm text-fg-muted">
                  {t('careers.snapSendDesc')}
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="text-fg-muted font-light">04</span>
              <div>
                <p className="font-medium mb-1">{t('careers.noLongEssays')}</p>
                <p className="text-sm text-fg-muted">
                  {t('careers.noLongEssaysDesc')}
                </p>
              </div>
            </li>
          </ul>
        </section>

        {/* Who You Are */}
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.2em] uppercase text-fg-muted mb-4">
            {t('careers.whoYouAre')}
          </h2>
          <ul className="space-y-4">
            <li className="flex gap-4">
              <span className="w-2 h-2 bg-fg rounded-full mt-2 flex-shrink-0"></span>
              <div>
                <p className="font-medium mb-1">{t('careers.aLocal')}</p>
                <p className="text-sm text-fg-muted">
                  {t('careers.aLocalDesc')}
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="w-2 h-2 bg-fg rounded-full mt-2 flex-shrink-0"></span>
              <div>
                <p className="font-medium mb-1">{t('careers.visual')}</p>
                <p className="text-sm text-fg-muted">
                  {t('careers.visualDesc')}
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="w-2 h-2 bg-fg rounded-full mt-2 flex-shrink-0"></span>
              <div>
                <p className="font-medium mb-1">{t('careers.connected')}</p>
                <p className="text-sm text-fg-muted">
                  {t('careers.connectedDesc')}
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="w-2 h-2 bg-fg rounded-full mt-2 flex-shrink-0"></span>
              <div>
                <p className="font-medium mb-1">{t('careers.opinionated')}</p>
                <p className="text-sm text-fg-muted">
                  {t('careers.opinionatedDesc')}
                </p>
              </div>
            </li>
          </ul>
        </section>

        {/* Apply */}
        <section className="border-t border-border pt-12">
          <h2 className="text-xs tracking-[0.2em] uppercase text-fg-muted mb-4">
            {t('careers.toApply')}
          </h2>
          <p className="text-fg-muted leading-relaxed mb-6">
            <a href="mailto:editors@readflaneur.com?subject=Neighborhood Editor Application" className="text-fg underline decoration-neutral-600 hover:text-fg">
              editors@readflaneur.com
            </a>
            {' '}{t('careers.applyIntro')}
          </p>
          <ol className="list-decimal list-inside space-y-2 text-fg-muted">
            <li>{t('careers.apply1')}</li>
            <li>{t('careers.apply2')}</li>
            <li>{t('careers.apply3')}</li>
          </ol>
        </section>
      </div>
    </div>
  );
}
