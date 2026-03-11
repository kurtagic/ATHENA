import React from 'react';
import { useBannerStore } from '../../stores/bannerStore';

export function CommandBanner() {
  const activeBanner = useBannerStore((s) => s.activeBanner);

  if (!activeBanner) return null;

  const isFire = activeBanner.command === 'fire';

  return (
    <div
      key={activeBanner.id}
      className="fixed inset-0 flex items-center justify-center z-[9999] pointer-events-none animate-banner-flash"
    >
      <div
        className={`px-16 py-8 rounded-lg border-2 ${
          isFire
            ? 'border-emerald-500/80 bg-emerald-950/60 text-emerald-400'
            : 'border-red-500/80 bg-red-950/60 text-red-400'
        }`}
        style={{
          backdropFilter: 'blur(8px)',
          textShadow: isFire
            ? '0 0 30px rgba(16, 185, 129, 0.8), 0 0 60px rgba(16, 185, 129, 0.4)'
            : '0 0 30px rgba(239, 68, 68, 0.8), 0 0 60px rgba(239, 68, 68, 0.4)',
        }}
      >
        <div className="text-5xl font-black uppercase tracking-[0.2em]">
          {isFire ? 'ARTILLERY FIRE' : 'ARTILLERY STOP'}
        </div>
      </div>
    </div>
  );
}
