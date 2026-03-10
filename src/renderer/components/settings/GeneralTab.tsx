import React, { useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';

export function GeneralTab() {
  const settings = useSettingsStore((s) => s.settings);
  const updateGeneralSetting = useSettingsStore((s) => s.updateGeneralSetting);
  const [needsRestart, setNeedsRestart] = useState(false);

  if (!settings) return null;

  const windowed = settings.general.windowedMode;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] bg-white/[0.03] border border-white/[0.06]">
        <span className="flex-1 text-[12px] text-white/70 font-medium">
          Windowed Mode
        </span>
        <button
          className={`relative w-9 h-5 rounded-full border transition-all duration-200 cursor-pointer ${
            windowed
              ? 'bg-emerald-600/40 border-emerald-400/30'
              : 'bg-white/[0.06] border-white/10'
          }`}
          onClick={() => {
            updateGeneralSetting('windowedMode', !windowed);
            setNeedsRestart(true);
          }}
        >
          <div
            className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all duration-200 ${
              windowed
                ? 'left-[18px] bg-emerald-400'
                : 'left-0.5 bg-white/40'
            }`}
          />
        </button>
      </div>
      <p className="text-[10px] text-white/30 px-1 leading-relaxed">
        Switches from fullscreen overlay to a resizable, draggable window. The app will no longer stay on top of other windows.
      </p>
      {needsRestart && (
        <p className="text-[11px] text-amber-400/80 px-1 font-medium">
          Restart the app for this to take effect.
        </p>
      )}
    </div>
  );
}
