'use client';

import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

interface ShareButtonProps {
  title: string;
  text: string;
  url: string;
  className?: string;
  variant?: 'icon' | 'text';
}

export function ShareButton({ title, text, url, className = '', variant = 'icon' }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const fullUrl = `${window.location.origin}${url}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: fullUrl });
        return;
      } catch {
        // User cancelled or share failed, fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  if (variant === 'text') {
    return (
      <button onClick={handleShare} className={className}>
        {copied ? t('share.copied').toUpperCase() : t('share.share').toUpperCase()}
      </button>
    );
  }

  return (
    <button
      onClick={handleShare}
      className={`text-fg-muted hover:text-fg transition-colors ${className}`}
      aria-label={t('share.share')}
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 7.5v4a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-4M7 1.5v7M4.5 4L7 1.5 9.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  );
}
