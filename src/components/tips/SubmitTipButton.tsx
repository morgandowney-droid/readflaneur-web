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
    header: 'text-xs tracking-widest uppercase transition-colors hover:text-black text-neutral-400',
    neighborhood: 'px-4 py-2 border border-neutral-300 text-sm hover:border-black transition-colors',
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
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
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
