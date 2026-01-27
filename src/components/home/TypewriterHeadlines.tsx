'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Headline {
  text: string;
  neighborhood: string;
  url: string;
}

interface TypewriterHeadlinesProps {
  headlines: Headline[];
}

export function TypewriterHeadlines({ headlines }: TypewriterHeadlinesProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (headlines.length === 0) return;

    const current = headlines[currentIndex];
    const fullText = current.text;

    const timeout = setTimeout(() => {
      if (!isDeleting) {
        // Typing
        if (displayText.length < fullText.length) {
          setDisplayText(fullText.slice(0, displayText.length + 1));
        } else {
          // Pause at end before deleting
          setTimeout(() => setIsDeleting(true), 2000);
        }
      } else {
        // Deleting
        if (displayText.length > 0) {
          setDisplayText(displayText.slice(0, -1));
        } else {
          // Move to next headline
          setIsDeleting(false);
          setCurrentIndex((prev) => (prev + 1) % headlines.length);
        }
      }
    }, isDeleting ? 30 : 50); // Faster deletion, slower typing

    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, currentIndex, headlines]);

  if (headlines.length === 0) return null;

  const handleClick = () => {
    const current = headlines[currentIndex];
    if (current.url && current.url !== '#') {
      router.push(current.url);
    }
  };

  const currentNeighborhood = headlines[currentIndex]?.neighborhood || '';

  return (
    <div className="text-center h-20 flex flex-col justify-start">
      <p className="text-xs tracking-widest uppercase mb-2">
        <span className="text-neutral-400">latest</span>
        {currentNeighborhood && (
          <span className="text-neutral-300"> · {currentNeighborhood}</span>
        )}
      </p>
      <button
        onClick={handleClick}
        className="text-white hover:underline cursor-pointer"
      >
        {displayText}
        <span className="animate-pulse">|</span>
      </button>
    </div>
  );
}
