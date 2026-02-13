'use client';

interface AIImageDisclaimerProps {
  className?: string;
}

export function AIImageDisclaimer({ className = '' }: AIImageDisclaimerProps) {
  return (
    <div className={`text-xs text-fg-subtle ${className}`}>
      <p className="font-medium text-neutral-600">AI-Generated Illustration | Dramatization</p>
      <p className="italic mt-0.5">
        This image is a stylized artistic rendering used for illustrative purposes only.
        It is not a photograph of the actual event and does not depict real individuals or specific locations.
      </p>
    </div>
  );
}

interface AIImageBadgeProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export function AIImageBadge({ position = 'bottom-left' }: AIImageBadgeProps) {
  const positionClasses = {
    'top-left': 'top-2 left-2',
    'top-right': 'top-2 right-2',
    'bottom-left': 'bottom-2 left-2',
    'bottom-right': 'bottom-2 right-2',
  };

  return (
    <div
      className={`absolute ${positionClasses[position]} bg-black/70 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm flex items-center gap-1`}
    >
      <span>AI Illustration</span>
    </div>
  );
}
