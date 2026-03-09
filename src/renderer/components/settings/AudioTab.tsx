import React from 'react';
import { useSettingsStore } from '../../stores/settingsStore';

export function AudioTab() {
  const settings = useSettingsStore((s) => s.settings);
  const updateAudioSetting = useSettingsStore((s) => s.updateAudioSetting);

  if (!settings) return null;

  const enabled = settings.audio.autoSilenceOnVoice;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] bg-white/[0.03] border border-white/[0.06]">
        <span className="flex-1 text-[12px] text-white/70 font-medium">
          Auto-silence other apps during voice chat
          <span className="ml-1.5 text-[10px] font-bold text-amber-400 uppercase tracking-wide">EXPERIMENTAL BETA</span>
        </span>
        <button
          className={`relative w-9 h-5 rounded-full border transition-all duration-200 cursor-pointer ${
            enabled
              ? 'bg-emerald-600/40 border-emerald-400/30'
              : 'bg-white/[0.06] border-white/10'
          }`}
          onClick={() => updateAudioSetting('autoSilenceOnVoice', !enabled)}
        >
          <div
            className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all duration-200 ${
              enabled
                ? 'left-[18px] bg-emerald-400'
                : 'left-0.5 bg-white/40'
            }`}
          />
        </button>
      </div>
      <p className="text-[10px] text-white/30 px-1 leading-relaxed">
        When enabled, all other desktop applications will be muted while you are transmitting or receiving voice chat. Audio is restored after a short delay when voice activity stops.
      </p>
    </div>
  );
}
