import React, { useEffect, useRef } from 'react';
import { X, Trash2, Bug } from 'lucide-react';
import { useDebugStore, type DebugCategory } from '../../stores/debugStore';

const CATEGORY_COLORS: Record<DebugCategory, string> = {
  ws: 'bg-amber-400/20 text-amber-400',
  sync: 'bg-cyan-400/20 text-cyan-400',
  session: 'bg-blue-400/20 text-blue-400',
  error: 'bg-red-400/20 text-red-400',
  yjs: 'bg-green-400/20 text-green-400',
  voice: 'bg-purple-400/20 text-purple-400',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8);
}

export function DebugPanel() {
  const open = useDebugStore((s) => s.open);
  const entries = useDebugStore((s) => s.entries);
  const toggle = useDebugStore((s) => s.toggle);
  const clear = useDebugStore((s) => s.clear);
  const scrollRef = useRef<HTMLDivElement>(null);

  const errorCount = entries.filter((e) => e.category === 'error').length;

  // F12 toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  if (!open) {
    // Floating error badge button — only visible when errors exist
    if (errorCount === 0) return null;
    return (
      <button
        onClick={toggle}
        className="fixed bottom-4 right-4 p-2 rounded-lg border border-white/10 backdrop-blur-xl cursor-pointer hover:border-red-400/40 transition-colors"
        style={{
          zIndex: 9997,
          background: 'linear-gradient(180deg, rgba(18,18,22,0.92) 0%, rgba(12,12,14,0.96) 100%)',
        }}
      >
        <Bug size={16} className="text-red-400" />
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
          {errorCount}
        </span>
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-4 right-4 w-[380px] max-h-[50vh] flex flex-col rounded-lg border border-white/10 backdrop-blur-xl overflow-hidden"
      style={{
        zIndex: 9997,
        background: 'linear-gradient(180deg, rgba(18,18,22,0.92) 0%, rgba(12,12,14,0.96) 100%)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/60">Debug</span>
        <div className="flex items-center gap-1">
          <button onClick={clear} className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/70 cursor-pointer transition-colors">
            <Trash2 size={13} />
          </button>
          <button onClick={toggle} className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/70 cursor-pointer transition-colors">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-0.5 min-h-0">
        {entries.length === 0 && (
          <div className="text-white/20 text-[11px] text-center py-4">No log entries</div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-start gap-1.5 text-[11px] leading-4 py-0.5">
            <span className="text-white/30 font-mono shrink-0">{formatTime(entry.timestamp)}</span>
            <span className={`px-1 rounded text-[10px] font-bold uppercase shrink-0 ${CATEGORY_COLORS[entry.category]}`}>
              {entry.category}
            </span>
            <span className="text-white/70 break-all">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
