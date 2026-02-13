'use client';

import { useState, useRef, useEffect } from 'react';
import { useLanguageContext, SUPPORTED_LANGUAGES, LanguageCode } from '@/components/providers/LanguageProvider';

/** Greyscale wireframe globe icon (monochrome, currentColor) */
function GlobeIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <ellipse cx="12" cy="12" rx="4" ry="10" />
      <path d="M2 12h20" />
      <path d="M4.5 6.5h15" />
      <path d="M4.5 17.5h15" />
    </svg>
  );
}

export function LanguageToggle({ className = '' }: { className?: string }) {
  const { language, isTranslated, setLanguage, detectLanguage, toggleTranslation } = useLanguageContext();
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
        {/* Globe button: toggle translation on/off, or open picker if browser is English */}
        <button
          onClick={() => {
            if (isTranslated) {
              // Back to English
              toggleTranslation();
            } else {
              // Try to detect browser language
              const detected = detectLanguage();
              if (detected === 'en') {
                // Browser is English - open picker so user can choose
                setPickerOpen(true);
              }
              // If detected non-English, toggleTranslation already set it
            }
          }}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-fg-subtle hover:text-fg transition-colors"
          aria-label={isTranslated ? 'Switch to English' : 'Translate page'}
          title={isTranslated ? 'Back to English' : 'Translate'}
          data-testid="language-toggle"
        >
          <GlobeIcon className="w-5 h-5" />
        </button>

        {/* Language badge: click opens picker */}
        {isTranslated && (
          <button
            onClick={() => setPickerOpen(!pickerOpen)}
            className="ml-[-8px] px-1.5 py-0.5 text-[10px] font-mono font-medium tracking-wider uppercase bg-amber-500/20 text-accent rounded"
            aria-label="Choose language"
            title="Choose language"
            data-testid="language-badge"
          >
            {language.toUpperCase()}
          </button>
        )}
      </div>

      {/* Language picker dropdown */}
      {pickerOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-surface border border-border-strong rounded-lg shadow-lg z-50 py-1" data-testid="language-picker">
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
