'use client';

import { useEffect, useState } from 'react';
import TipSubmitForm from './TipSubmitForm';

interface TipSubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialNeighborhoodId?: string;
}

export default function TipSubmitModal({
  isOpen,
  onClose,
  initialNeighborhoodId,
}: TipSubmitModalProps) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [tipId, setTipId] = useState<string | null>(null);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowSuccess(false);
      setTipId(null);
    }
  }, [isOpen]);

  const handleSuccess = (id: string) => {
    setTipId(id);
    setShowSuccess(true);
  };

  const handleClose = () => {
    setShowSuccess(false);
    setTipId(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[90vh] bg-white rounded-lg shadow-xl overflow-hidden mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <h2 className="text-lg font-medium">
            {showSuccess ? 'Thank You!' : 'Submit a Tip'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 text-neutral-400 hover:text-black transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-80px)]">
          {showSuccess ? (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h3 className="text-xl font-medium">Tip Submitted Successfully</h3>

              <p className="text-neutral-600 text-sm">
                Thank you for contributing to local journalism. Our editorial team
                will review your tip and may reach out if we have questions.
              </p>

              {tipId && (
                <p className="text-xs text-neutral-500">
                  Reference ID: {tipId.slice(0, 8)}
                </p>
              )}

              <button
                type="button"
                onClick={handleClose}
                className="mt-4 px-6 py-2 bg-black text-white text-sm uppercase tracking-wider hover:bg-neutral-800"
              >
                Done
              </button>
            </div>
          ) : (
            <TipSubmitForm
              initialNeighborhoodId={initialNeighborhoodId}
              onSuccess={handleSuccess}
              onCancel={handleClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}
