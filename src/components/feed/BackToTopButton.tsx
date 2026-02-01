'use client';

import { useScrollDirection } from '@/hooks/useScrollDirection';
import { cn } from '@/lib/utils';

interface BackToTopButtonProps {
  /** Minimum scroll position before showing the button */
  showAfter?: number;
  /** Optional label text (e.g., "New stories") */
  label?: string;
  /** Whether there's new content to show */
  hasNewContent?: boolean;
}

export function BackToTopButton({
  showAfter = 400,
  label,
  hasNewContent = false,
}: BackToTopButtonProps) {
  const { scrollY } = useScrollDirection();

  const shouldShow = scrollY > showAfter || hasNewContent;

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!shouldShow) return null;

  return (
    <button
      onClick={handleClick}
      className={cn(
        'fixed top-20 left-1/2 -translate-x-1/2 z-40',
        'flex items-center gap-2 px-4 py-2.5',
        'bg-black text-white text-sm font-medium',
        'rounded-full shadow-lg',
        'transition-all duration-200',
        'hover:bg-neutral-800 hover:shadow-xl active:scale-95'
      )}
      style={{
        animation: 'fadeIn 0.2s ease-out'
      }}
      aria-label={label || 'Back to top'}
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 10l7-7m0 0l7 7m-7-7v18"
        />
      </svg>
      <span>{label || 'Back to top'}</span>
    </button>
  );
}
