import React, { useState } from 'react';
import logoUrl from '../../../../athena.png';

const API_URL = 'https://api.athena.kurti.si';

interface BetaGateProps {
  onVerified: (code: string) => void;
}

export function BetaGate({ onVerified }: BetaGateProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleVerify() {
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Enter an access code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/beta/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed, purpose: 'app' }),
      });
      const data = await res.json();

      if (data.valid) {
        onVerified(trimmed.replace(/[-\s]/g, '').toUpperCase());
      } else {
        setError('Invalid or expired access code');
      }
    } catch {
      setError('Could not reach server. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen select-none"
      style={{
        background: `radial-gradient(ellipse at center, rgba(74,158,255,0.04), transparent 70%), var(--color-background)`,
      }}
    >
      <div className="flex flex-col items-center mb-12">
        <img
          src={logoUrl}
          alt="Athena"
          className="w-32 h-32 mb-6 opacity-80"
          style={{ filter: 'brightness(0.85) sepia(1) hue-rotate(10deg) saturate(3)' }}
        />
        <h1
          className="text-5xl font-bold uppercase tracking-[0.3em] text-[var(--color-gold)]"
          style={{ textShadow: '0 0 30px rgba(var(--gold-rgb, 212,175,55), 0.3)' }}
        >
          ATHENA
        </h1>
        <p className="mt-3 text-sm text-white/30 uppercase tracking-[0.15em]">
          Beta Access
        </p>
      </div>

      <div className="w-[380px]">
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
          placeholder="Enter access code"
          autoFocus
          className="w-full px-5 py-4 bg-[rgba(12,12,14,0.8)] border border-[var(--color-border-glass)] rounded-[var(--radius-md)] text-white text-center text-lg font-mono tracking-[0.25em] placeholder:text-white/15 focus:outline-none focus:border-[var(--color-gold)]/40 transition-colors"
        />

        {error && (
          <p className="mt-3 text-sm text-red-400 text-center">{error}</p>
        )}

        <button
          onClick={handleVerify}
          disabled={loading}
          className="mt-5 w-full flex items-center justify-center gap-2 px-8 py-4 bg-blue-600/40 hover:bg-blue-600/55 border border-blue-400/20 hover:border-blue-400/40 rounded-[var(--radius-md)] text-white font-semibold uppercase tracking-[0.12em] text-[16px] transition-all hover:shadow-[0_0_20px_rgba(59,130,246,0.15)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Verifying...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
