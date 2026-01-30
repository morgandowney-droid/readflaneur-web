'use client';

import { useState } from 'react';
import TipSubmitModal from './TipSubmitModal';

interface SubmitTipButtonProps {
  variant?: 'header' | 'neighborhood' | 'floating';
  neighborhoodId?: string;
  className?: string;
}

export default function SubmitTipButton({
  variant = 'header',
  neighborhoodId,
  className = '',
}: SubmitTipButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const baseStyles = {
    header: 'text-xs tracking-widest uppercase transition-colors hover:text-black text-neutral-400 min-h-[44px] flex items-center',
    neighborhood: 'inline-flex items-center gap-2 text-xs tracking-widest uppercase border border-neutral-200 px-4 py-2.5 hover:border-black transition-colors min-h-[44px]',
    floating: `
      fixed bottom-6 right-6 z-40
      w-14 h-14 rounded-full
      bg-black text-white
      shadow-lg hover:shadow-xl
      flex items-center justify-center
      transition-all hover:scale-105
    `,
  };

  return (
    <>
      {variant === 'floating' ? (
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className={`${baseStyles[variant]} ${className}`}
          aria-label="Submit a tip"
        >
          {/* Whisper/secret icon - person with hand cupped near mouth */}
          <svg
            className="w-6 h-6"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            {/* Head */}
            <circle cx="10" cy="8" r="4" />
            {/* Body/shoulder */}
            <path d="M3 21v-2c0-2.5 3-4.5 7-4.5s7 2 7 4.5v2" />
            {/* Hand cupped near mouth */}
            <path d="M16 10c1.5 0 3 1 3.5 2.5M15 12.5c1 0 2.5.5 3 1.5" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" />
          </svg>
        </button>
      ) : variant === 'neighborhood' ? (
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className={`${baseStyles[variant]} ${className}`}
        >
          {/* Whisper/secret icon - person with hand cupped near mouth */}
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="10" cy="8" r="4" />
            <path d="M3 21v-2c0-2.5 3-4.5 7-4.5s7 2 7 4.5v2" />
            <path d="M16 10c1.5 0 3 1 3.5 2.5M15 12.5c1 0 2.5.5 3 1.5" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" />
          </svg>
          Tip
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className={`${baseStyles[variant]} ${className}`}
        >
          <span className="hidden sm:inline">Submit a Tip</span>
          <span className="sm:hidden">Tip</span>
        </button>
      )}

      <TipSubmitModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialNeighborhoodId={neighborhoodId}
      />
    </>
  );
}
