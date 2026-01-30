'use client';

import { useState, useEffect, useRef } from 'react';

export type ScrollDirection = 'up' | 'down' | null;

interface UseScrollDirectionOptions {
  threshold?: number; // Minimum scroll distance before triggering
  initialDirection?: ScrollDirection;
}

export function useScrollDirection(options: UseScrollDirectionOptions = {}) {
  const { threshold = 10, initialDirection = null } = options;

  const [scrollDirection, setScrollDirection] = useState<ScrollDirection>(initialDirection);
  const [scrollY, setScrollY] = useState(0);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const updateScrollDirection = () => {
      const currentScrollY = window.scrollY;

      // Update current scroll position
      setScrollY(currentScrollY);

      // Determine direction if we've scrolled enough
      const diff = currentScrollY - lastScrollY.current;

      if (Math.abs(diff) >= threshold) {
        const newDirection = diff > 0 ? 'down' : 'up';
        setScrollDirection(newDirection);
        lastScrollY.current = currentScrollY;
      }

      // At the very top, show header
      if (currentScrollY < threshold) {
        setScrollDirection('up');
      }

      ticking.current = false;
    };

    const onScroll = () => {
      if (!ticking.current) {
        window.requestAnimationFrame(updateScrollDirection);
        ticking.current = true;
      }
    };

    // Set initial values
    lastScrollY.current = window.scrollY;
    setScrollY(window.scrollY);

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return { scrollDirection, scrollY };
}
