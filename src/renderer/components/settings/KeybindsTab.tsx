import React, { useState, useEffect, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { keyEventToAccelerator, acceleratorToDisplay } from '../../lib/keybindUtils';
import type { Settings } from '../../../shared/types';

const KEYBIND_DEFAULTS: Record<string, string> = {
  toggleOverlay: '`',
  pushToTalk: 'F5',
  quickNotification: '-',
};

const KEYBIND_ACTIONS = [
  { key: 'toggleOverlay' as const, label: 'Toggle Overlay' },
  { key: 'pushToTalk' as const, label: 'Toggle to Talk' },
  { key: 'quickNotification' as const, label: 'Quick Notification' },
];

export function KeybindsTab() {
  const settings = useSettingsStore((s) => s.settings);
  const error = useSettingsStore((s) => s.error);
  const updateKeybind = useSettingsStore((s) => s.updateKeybind);
  const [listening, setListening] = useState<string | null>(null);
  const [unsupportedKey, setUnsupportedKey] = useState<string | null>(null);

  const handleCapture = useCallback(
    (e: KeyboardEvent) => {
      if (!listening) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setListening(null);
        setUnsupportedKey(null);
        return;
      }

      const accel = keyEventToAccelerator(e);
      if (!accel) {
        // Show message for non-modifier unsupported keys
        if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
          setUnsupportedKey(e.key);
        }
        return;
      }

      setListening(null);
      setUnsupportedKey(null);
      updateKeybind(listening as keyof Settings['keybinds'], accel);
    },
    [listening, updateKeybind, settings]
  );

  useEffect(() => {
    if (!listening) return;
    document.addEventListener('keydown', handleCapture, true);
    return () => document.removeEventListener('keydown', handleCapture, true);
  }, [listening, handleCapture]);

  if (!settings) return null;

  return (
    <div className="flex flex-col gap-2">
      {KEYBIND_ACTIONS.map((action) => {
        const currentKey = settings.keybinds[action.key];
        const isListening = listening === action.key;
        const isDefault = currentKey === KEYBIND_DEFAULTS[action.key];

        return (
          <div
            key={action.key}
            className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] bg-white/[0.03] border border-white/[0.06]"
          >
            <span className="flex-1 text-[12px] text-white/70 font-medium">
              {action.label}
            </span>

            {/* Key badge */}
            <div
              className={`min-w-[80px] text-center px-3 py-1 rounded text-[12px] font-mono font-semibold border transition-all duration-200 ${
                isListening
                  ? 'border-[var(--color-gold)]/50 bg-[var(--color-gold)]/10 text-[var(--color-gold)] animate-pulse'
                  : 'border-white/10 bg-white/[0.05] text-white/80'
              }`}
            >
              {isListening ? 'Press a key...' : acceleratorToDisplay(currentKey)}
            </div>

            {/* Rebind button */}
            <button
              className={`px-3 py-1 rounded-[var(--radius-sm)] text-[11px] font-semibold uppercase tracking-[0.06em] border cursor-pointer transition-all duration-150 ${
                isListening
                  ? 'bg-white/10 border-white/20 text-white/60'
                  : 'bg-white/[0.05] border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70'
              }`}
              onClick={() => { setListening(isListening ? null : action.key); setUnsupportedKey(null); }}
            >
              {isListening ? 'Cancel' : 'Rebind'}
            </button>

            {/* Reset button */}
            {!isDefault && (
              <button
                className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] bg-transparent border border-white/10 text-white/30 cursor-pointer transition-all duration-150 hover:bg-white/10 hover:text-white/60"
                title="Reset to default"
                onClick={() => updateKeybind(action.key, KEYBIND_DEFAULTS[action.key])}
              >
                <RotateCcw size={12} />
              </button>
            )}
          </div>
        );
      })}

      {unsupportedKey && (
        <div className="mt-2 px-3 py-2 rounded-[var(--radius-sm)] bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-[11px]">
          "{unsupportedKey}" is not supported. Try a standard key (A-Z, 0-9, F1-F24).
        </div>
      )}

      {error && (
        <div className="mt-2 px-3 py-2 rounded-[var(--radius-sm)] bg-red-500/10 border border-red-500/20 text-red-400 text-[11px]">
          {error}
        </div>
      )}
    </div>
  );
}
