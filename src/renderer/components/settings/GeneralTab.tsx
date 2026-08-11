import React, { useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { validateServerAddress } from '../../multiplayer/serverUrls';

export function GeneralTab() {
  const settings = useSettingsStore((s) => s.settings);
  const updateGeneralSetting = useSettingsStore((s) => s.updateGeneralSetting);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressSaved, setAddressSaved] = useState(false);

  if (!settings) return null;

  const windowed = settings.general.windowedMode;
  const addressValue = address ?? settings.general.serverAddress;

  const commitAddress = () => {
    const trimmed = addressValue.trim();
    if (trimmed === settings.general.serverAddress) return;
    if (trimmed !== '') {
      const error = validateServerAddress(trimmed);
      if (error) {
        setAddressError(error);
        setAddressSaved(false);
        return;
      }
    }
    setAddressError(null);
    updateGeneralSetting('serverAddress', trimmed);
    setAddress(null);
    setAddressSaved(true);
  };

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

      <div className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] bg-white/[0.03] border border-white/[0.06]">
        <span className="text-[12px] text-white/70 font-medium whitespace-nowrap">
          Server Address
        </span>
        <input
          type="text"
          value={addressValue}
          placeholder="e.g. 203.0.113.7:8080"
          spellCheck={false}
          className="flex-1 min-w-0 bg-transparent text-[12px] text-white/80 placeholder:text-white/25 outline-none text-right"
          onChange={(e) => {
            setAddress(e.target.value);
            setAddressError(null);
            setAddressSaved(false);
          }}
          onBlur={commitAddress}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitAddress();
          }}
        />
      </div>
      {addressError && (
        <p className="text-[11px] text-red-400/80 px-1 font-medium">{addressError}</p>
      )}
      {addressSaved && !addressError && (
        <p className="text-[11px] text-amber-400/80 px-1 font-medium">
          Applies the next time you connect (restart the app if you are in a lobby).
        </p>
      )}
      <p className="text-[10px] text-white/30 px-1 leading-relaxed">
        Address of the self-hosted Athena server, as given by the host. Formats: 203.0.113.7, 203.0.113.7:8080, [2001:db8::1]:8080 (IPv6 needs brackets with a port), or a full ws:// / wss:// URL. Required for multiplayer.
      </p>
    </div>
  );
}
