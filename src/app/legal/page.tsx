'use client';

import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

type Tab = 'privacy' | 'terms';

export default function LegalPage() {
  const [activeTab, setActiveTab] = useState<Tab>('privacy');
  const { t } = useTranslation();

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-light tracking-wide mb-8">{t('legal.title')}</h1>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-border mb-8">
          <button
            onClick={() => setActiveTab('privacy')}
            className={`pb-3 text-sm transition-colors ${
              activeTab === 'privacy'
                ? 'border-b-2 border-amber-500 text-fg font-medium'
                : 'text-fg-subtle hover:text-fg'
            }`}
          >
            {t('legal.privacyPolicy')}
          </button>
          <button
            onClick={() => setActiveTab('terms')}
            className={`pb-3 text-sm transition-colors ${
              activeTab === 'terms'
                ? 'border-b-2 border-amber-500 text-fg font-medium'
                : 'text-fg-subtle hover:text-fg'
            }`}
          >
            {t('legal.termsOfService')}
          </button>
        </div>

        {/* Content */}
        <div className="prose prose-neutral [&_*]:text-fg-muted [&_h1]:text-fg [&_h2]:text-fg [&_h3]:text-fg [&_strong]:text-fg">
          {activeTab === 'privacy' ? <PrivacyContent /> : <TermsContent />}
        </div>
      </div>
    </div>
  );
}

function PrivacyContent() {
  const { t } = useTranslation();

  return (
    <>
      <p className="text-sm text-fg-subtle mb-8">
        {t('legal.lastUpdated')}
      </p>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">{t('privacy.s1Title')}</h2>
        <p className="text-sm text-fg-muted mb-4">
          {t('privacy.s1Text')}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">{t('privacy.s2Title')}</h2>

        <h3 className="text-base font-medium mt-6 mb-3">{t('privacy.s2_1Title')}</h3>
        <ul className="text-sm text-fg-muted list-disc pl-6 mb-4 space-y-1">
          <li>{t('privacy.s2_1_account')}</li>
          <li>{t('privacy.s2_1_tips')}</li>
          <li>{t('privacy.s2_1_newsletter')}</li>
          <li>{t('privacy.s2_1_advertising')}</li>
        </ul>

        <h3 className="text-base font-medium mt-6 mb-3">{t('privacy.s2_2Title')}</h3>
        <p className="text-sm text-fg-muted mb-2">
          {t('privacy.s2_2Text')}
        </p>
        <ul className="text-sm text-fg-muted list-disc pl-6 mb-4 space-y-1">
          <li>{t('privacy.s2_2_device')}</li>
          <li>{t('privacy.s2_2_usage')}</li>
          <li>{t('privacy.s2_2_location')}</li>
          <li>{t('privacy.s2_2_cookies')}</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">{t('privacy.s3Title')}</h2>
        <ul className="text-sm text-fg-muted list-disc pl-6 mb-4 space-y-1">
          <li>{t('privacy.s3_1')}</li>
          <li>{t('privacy.s3_2')}</li>
          <li>{t('privacy.s3_3')}</li>
          <li>{t('privacy.s3_4')}</li>
          <li>{t('privacy.s3_5')}</li>
          <li>{t('privacy.s3_6')}</li>
          <li>{t('privacy.s3_7')}</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">{t('privacy.s4Title')}</h2>
        <p className="text-sm text-fg-muted mb-2">
          {t('privacy.s4Text')}
        </p>
        <ul className="text-sm text-fg-muted list-disc pl-6 mb-4 space-y-1">
          <li>{t('privacy.s4_providers')}</li>
          <li>{t('privacy.s4_legal')}</li>
          <li>{t('privacy.s4_business')}</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">{t('privacy.s5Title')}</h2>
        <p className="text-sm text-fg-muted mb-2">
          {t('privacy.s5Text')}
        </p>
        <ul className="text-sm text-fg-muted list-disc pl-6 mb-4 space-y-1">
          <li>{t('privacy.s5_1')}</li>
          <li>{t('privacy.s5_2')}</li>
          <li>{t('privacy.s5_3')}</li>
          <li>{t('privacy.s5_4')}</li>
          <li>{t('privacy.s5_5')}</li>
        </ul>
        <p className="text-sm text-fg-muted mb-4">
          {t('privacy.s5Contact')}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">{t('privacy.s6Title')}</h2>
        <p className="text-sm text-fg-muted mb-4">
          {t('privacy.s6Text')}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">{t('privacy.s7Title')}</h2>
        <p className="text-sm text-fg-muted">
          {t('privacy.s7Text')}
        </p>
      </section>
    </>
  );
}

function TermsContent() {
  const { t } = useTranslation();

  return (
    <>
      <p className="text-sm text-fg-subtle mb-8">
        {t('legal.lastUpdated')}
      </p>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">{t('terms.s1Title')}</h2>
        <p className="text-sm text-fg-muted mb-4">
          {t('terms.s1Text')}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">{t('terms.s2Title')}</h2>
        <p className="text-sm text-fg-muted mb-4">
          {t('terms.s2Text')}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">{t('terms.s3Title')}</h2>
        <p className="text-sm text-fg-muted mb-4">
          {t('terms.s3Text')}
        </p>
        <p className="text-sm text-fg-muted mb-2">
          {t('terms.s3WarrantText')}
        </p>
        <ul className="text-sm text-fg-muted list-disc pl-6 mb-4 space-y-1">
          <li>{t('terms.s3_1')}</li>
          <li>{t('terms.s3_2')}</li>
          <li>{t('terms.s3_3')}</li>
          <li>{t('terms.s3_4')}</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">{t('terms.s4Title')}</h2>
        <ul className="text-sm text-fg-muted list-disc pl-6 mb-4 space-y-1">
          <li>{t('terms.s4_1')}</li>
          <li>{t('terms.s4_2')}</li>
          <li>{t('terms.s4_3')}</li>
          <li>{t('terms.s4_4')}</li>
          <li>{t('terms.s4_5')}</li>
          <li>{t('terms.s4_6')}</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">{t('terms.s5Title')}</h2>
        <p className="text-sm text-fg-muted mb-4">
          {t('terms.s5Text')}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">{t('terms.s6Title')}</h2>
        <p className="text-sm text-fg-muted mb-4">
          {t('terms.s6Text')}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">{t('terms.s7Title')}</h2>
        <p className="text-sm text-fg-muted mb-4">
          {t('terms.s7Text')}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">{t('terms.s8Title')}</h2>
        <p className="text-sm text-fg-muted mb-4">
          {t('terms.s8Text')}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">{t('terms.s9Title')}</h2>
        <p className="text-sm text-fg-muted">
          {t('terms.s9Text')}
        </p>
      </section>
    </>
  );
}
