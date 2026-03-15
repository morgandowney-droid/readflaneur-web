'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function GateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'downey') {
      document.cookie = 'flaneur-gate=granted;path=/;max-age=31536000;SameSite=Strict';
      router.push(next);
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050505] px-4">
      <div className="w-full max-w-xs text-center">
        <h1 className="text-2xl tracking-[0.3em] text-neutral-200 mb-10 font-light" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>
          FLANEUR
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(false); }}
            placeholder="Password"
            autoFocus
            className="w-full px-4 py-3 bg-[#121212] border border-neutral-800 text-neutral-200 rounded-lg text-center text-sm tracking-widest focus:border-neutral-600 focus:outline-none"
          />
          {error && (
            <p className="text-red-400 text-xs">Incorrect password</p>
          )}
          <button
            type="submit"
            className="w-full py-3 bg-neutral-200 text-[#050505] text-sm tracking-widest uppercase rounded-lg hover:bg-neutral-300 transition-colors"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}

export default function GatePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#050505]">
        <div className="w-5 h-5 border-2 border-neutral-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <GateForm />
    </Suspense>
  );
}
