'use client';

import { useState, useRef, useEffect } from 'react';
import { useLanguageContext, SUPPORTED_LANGUAGES, LanguageCode } from '@/components/providers/LanguageProvider';

/** Greyscale Union Jack SVG (monochrome, currentColor) */
function UnionJackIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 30" className={className} fill="currentColor" aria-hidden="true">
      {/* Background */}
      <rect width="60" height="30" fill="currentColor" opacity="0.15" />
      {/* Diagonals */}
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="currentColor" strokeWidth="3" opacity="0.3" />
      {/* Cross */}
      <path d="M30,0 V30 M0,15 H60" stroke="currentColor" strokeWidth="5" opacity="0.25" />
      <path d="M30,0 V30 M0,15 H60" stroke="currentColor" strokeWidth="3" opacity="0.5" />
    </svg>
  );
}

export function LanguageToggle({ className = '' }: { className?: string }) {
  const { language, isTranslated, setLanguage, toggleTranslation } = useLanguageContext();
  const [pickerOpen, setPickerOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close picker on click outside
  useEffect(() => {
    if (!pickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [pickerOpen]);

  // Close on Escape
  useEffect(() => {
    if (!pickerOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [pickerOpen]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div className="flex items-center">
        {/* Flag button: toggle translation on/off */}
        <button
          onClick={toggleTranslation}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-fg-subtle hover:text-fg transition-colors"
          aria-label={isTranslated ? 'Switch to English' : 'Translate page'}
          title={isTranslated ? 'Back to English' : 'Translate'}
        >
          <UnionJackIcon className="w-5 h-3.5" />
        </button>

        {/* Language badge: click opens picker */}
        {isTranslated && (
          <button
            onClick={() => setPickerOpen(!pickerOpen)}
            className="ml-[-8px] px-1.5 py-0.5 text-[10px] font-mono font-medium tracking-wider uppercase bg-amber-500/20 text-accent rounded"
            aria-label="Choose language"
            title="Choose language"
          >
            {language.toUpperCase()}
          </button>
        )}
      </div>

      {/* Language picker dropdown */}
      {pickerOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-surface border border-border-strong rounded-lg shadow-lg z-50 py-1">
          {(Object.entries(SUPPORTED_LANGUAGES) as [LanguageCode, string][]).map(([code, name]) => (
            <button
              key={code}
              onClick={() => {
                setLanguage(code);
                setPickerOpen(false);
              }}
              className="w-full text-left px-4 py-2 text-sm hover:bg-hover transition-colors flex items-center justify-between"
            >
              <span className={language === code ? 'text-fg font-medium' : 'text-fg-muted'}>
                {code === 'en' ? 'English (Original)' : name}
              </span>
              {language === code && (
                <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
