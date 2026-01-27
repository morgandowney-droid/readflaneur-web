'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

type Persona = 'admin' | 'new-visitor' | 'subscriber' | 'advertiser';

interface PersonaConfig {
  id: Persona;
  label: string;
  description: string;
  icon: string;
  hideElements?: string[]; // CSS selectors to hide
  showBanner?: string; // Message to show
}

const PERSONAS: PersonaConfig[] = [
  {
    id: 'admin',
    label: 'Admin',
    description: 'Full access, see everything',
    icon: '👑',
  },
  {
    id: 'new-visitor',
    label: 'New Visitor',
    description: 'First-time visitor experience',
    icon: '👤',
    hideElements: ['.admin-only', '[data-admin]'],
    showBanner: 'Viewing as: New Visitor (no account)',
  },
  {
    id: 'subscriber',
    label: 'Subscriber',
    description: 'User with neighborhood selections',
    icon: '📍',
    hideElements: ['.admin-only', '[data-admin]'],
    showBanner: 'Viewing as: Subscriber (West Village)',
  },
  {
    id: 'advertiser',
    label: 'Advertiser',
    description: 'Business owner view',
    icon: '💼',
    hideElements: ['.admin-only', '[data-admin]'],
    showBanner: 'Viewing as: Advertiser',
  },
];

export function PersonaSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPersona, setCurrentPersona] = useState<Persona>('admin');
  const [isAdmin, setIsAdmin] = useState(false);
  const pathname = usePathname();

  // Check if user is admin (simple check via localStorage or cookie)
  useEffect(() => {
    const adminMode = localStorage.getItem('flaneur-admin-mode') === 'true';
    setIsAdmin(adminMode);

    const savedPersona = localStorage.getItem('flaneur-persona') as Persona;
    if (savedPersona && PERSONAS.find(p => p.id === savedPersona)) {
      setCurrentPersona(savedPersona);
    }
  }, []);

  // Apply persona effects
  useEffect(() => {
    const persona = PERSONAS.find(p => p.id === currentPersona);
    if (!persona) return;

    // Remove previous persona styles
    document.querySelectorAll('.persona-hidden').forEach(el => {
      el.classList.remove('persona-hidden');
    });

    // Apply new persona
    if (persona.hideElements) {
      persona.hideElements.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          el.classList.add('persona-hidden');
        });
      });
    }

    // Add persona indicator to body
    document.body.dataset.persona = currentPersona;
  }, [currentPersona, pathname]);

  const switchPersona = (persona: Persona) => {
    setCurrentPersona(persona);
    localStorage.setItem('flaneur-persona', persona);
    setIsOpen(false);
  };

  // Enable admin mode with secret key combo (Ctrl+Shift+A)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        const newAdminMode = !isAdmin;
        setIsAdmin(newAdminMode);
        localStorage.setItem('flaneur-admin-mode', String(newAdminMode));
        if (!newAdminMode) {
          setCurrentPersona('admin');
          localStorage.removeItem('flaneur-persona');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAdmin]);

  if (!isAdmin) return null;

  const currentConfig = PERSONAS.find(p => p.id === currentPersona)!;

  return (
    <>
      {/* Persona Banner */}
      {currentPersona !== 'admin' && currentConfig.showBanner && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-100 border-b border-amber-300 py-1 px-4 text-center text-xs text-amber-800">
          {currentConfig.showBanner}
          <button
            onClick={() => switchPersona('admin')}
            className="ml-2 underline hover:no-underline"
          >
            Exit
          </button>
        </div>
      )}

      {/* Floating Switcher Button */}
      <div className="fixed bottom-4 right-4 z-50">
        {isOpen && (
          <div className="absolute bottom-12 right-0 w-64 bg-white rounded-lg shadow-xl border border-neutral-200 overflow-hidden mb-2">
            <div className="p-3 border-b border-neutral-100 bg-neutral-50">
              <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                View As Persona
              </h3>
            </div>
            <div className="p-2">
              {PERSONAS.map((persona) => (
                <button
                  key={persona.id}
                  onClick={() => switchPersona(persona.id)}
                  className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-3 transition-colors ${
                    currentPersona === persona.id
                      ? 'bg-neutral-100'
                      : 'hover:bg-neutral-50'
                  }`}
                >
                  <span className="text-xl">{persona.icon}</span>
                  <div>
                    <div className="text-sm font-medium">{persona.label}</div>
                    <div className="text-xs text-neutral-500">{persona.description}</div>
                  </div>
                  {currentPersona === persona.id && (
                    <span className="ml-auto text-green-500">✓</span>
                  )}
                </button>
              ))}
            </div>
            <div className="p-2 border-t border-neutral-100 bg-neutral-50">
              <p className="text-xs text-neutral-400 text-center">
                Press Ctrl+Shift+A to toggle admin mode
              </p>
            </div>
          </div>
        )}

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-12 h-12 rounded-full bg-neutral-900 text-white shadow-lg flex items-center justify-center text-xl hover:bg-neutral-700 transition-colors"
          title="Switch Persona"
        >
          {currentConfig.icon}
        </button>
      </div>

      {/* Global styles for persona mode */}
      <style jsx global>{`
        .persona-hidden {
          display: none !important;
        }
        body[data-persona="new-visitor"] .admin-nav,
        body[data-persona="subscriber"] .admin-nav,
        body[data-persona="advertiser"] .admin-nav {
          display: none !important;
        }
        body[data-persona]:not([data-persona="admin"]) {
          padding-top: 28px;
        }
      `}</style>
    </>
  );
}
