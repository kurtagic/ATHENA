import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { voice } from '../../multiplayer/voiceManager';

interface DeviceInfo {
  deviceId: string;
  label: string;
}

export function AudioTab() {
  const settings = useSettingsStore((s) => s.settings);
  const updateAudioSetting = useSettingsStore((s) => s.updateAudioSetting);

  const [inputDevices, setInputDevices] = useState<DeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<DeviceInfo[]>([]);
  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const micTestStream = useRef<MediaStream | null>(null);
  const micTestAudioCtx = useRef<AudioContext | null>(null);
  const micTestAudioEl = useRef<HTMLAudioElement | null>(null);
  const micTestRaf = useRef<number>(0);

  const refreshDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(
        devices
          .filter((d) => d.kind === 'audioinput' && d.deviceId)
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Microphone (${d.deviceId.slice(0, 8)})` }))
      );
      setOutputDevices(
        devices
          .filter((d) => d.kind === 'audiooutput' && d.deviceId)
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Speaker (${d.deviceId.slice(0, 8)})` }))
      );
    } catch {
      // enumerateDevices may not be available
    }
  };

  const stopMicTest = useCallback(() => {
    if (micTestRaf.current) cancelAnimationFrame(micTestRaf.current);
    micTestRaf.current = 0;
    if (micTestStream.current) {
      for (const t of micTestStream.current.getTracks()) t.stop();
      micTestStream.current = null;
    }
    if (micTestAudioCtx.current) {
      micTestAudioCtx.current.close();
      micTestAudioCtx.current = null;
    }
    if (micTestAudioEl.current) {
      micTestAudioEl.current.srcObject = null;
      micTestAudioEl.current.remove();
      micTestAudioEl.current = null;
    }
    setMicLevel(0);
    setMicTesting(false);
  }, []);

  const startMicTest = useCallback(async () => {
    if (micTesting) { stopMicTest(); return; }

    const inputId = settings?.audio.inputDeviceId || '';
    const outputId = settings?.audio.outputDeviceId || '';
    const constraints: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
    if (inputId) constraints.deviceId = { exact: inputId };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
      micTestStream.current = stream;

      // Play back through selected output
      const audioEl = document.createElement('audio');
      audioEl.srcObject = stream;
      audioEl.autoplay = true;
      if (outputId && typeof audioEl.setSinkId === 'function') {
        await audioEl.setSinkId(outputId).catch(() => {});
      }
      document.body.appendChild(audioEl);
      micTestAudioEl.current = audioEl;

      // Level meter
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      micTestAudioCtx.current = ctx;

      const dataArr = new Uint8Array(analyser.frequencyBinCount);
      const poll = () => {
        analyser.getByteFrequencyData(dataArr);
        let sum = 0;
        for (let i = 0; i < dataArr.length; i++) sum += dataArr[i] * dataArr[i];
        const rms = Math.sqrt(sum / dataArr.length);
        setMicLevel(Math.min(rms / 80, 1)); // normalize roughly to 0-1
        micTestRaf.current = requestAnimationFrame(poll);
      };
      poll();
      setMicTesting(true);
    } catch {
      stopMicTest();
    }
  }, [micTesting, settings?.audio.inputDeviceId, settings?.audio.outputDeviceId, stopMicTest]);

  // Cleanup on unmount
  useEffect(() => () => stopMicTest(), [stopMicTest]);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
  }, []);

  if (!settings) return null;

  const enabled = settings.audio.autoSilenceOnVoice;
  const selectedInput = settings.audio.inputDeviceId;
  const selectedOutput = settings.audio.outputDeviceId;

  const selectClass =
    'w-full bg-[#1a1a2e] border border-white/[0.08] rounded-[var(--radius-sm)] text-[11px] text-white/80 px-2.5 py-1.5 outline-none cursor-pointer hover:border-white/15 focus:border-white/20 transition-colors [&>option]:bg-[#1a1a2e] [&>option]:text-white/80';

  return (
    <div className="flex flex-col gap-3">
      {/* Device Selection */}
      <div className="flex flex-col gap-2.5 px-3 py-2.5 rounded-[var(--radius-sm)] bg-white/[0.03] border border-white/[0.06]">
        <span className="text-[11px] text-white/50 font-medium uppercase tracking-wide">Devices</span>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-white/60 font-medium">Input (Microphone)</label>
          <select
            className={selectClass}
            value={selectedInput}
            onChange={(e) => {
              updateAudioSetting('inputDeviceId', e.target.value);
              voice.setInputDevice(e.target.value);
            }}
          >
            <option value="">System Default</option>
            {inputDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-white/60 font-medium">Output (Speaker)</label>
          <select
            className={selectClass}
            value={selectedOutput}
            onChange={(e) => {
              updateAudioSetting('outputDeviceId', e.target.value);
              voice.setOutputDevice(e.target.value);
            }}
          >
            <option value="">System Default</option>
            {outputDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Mic Test */}
      <div className="flex flex-col gap-2 px-3 py-2.5 rounded-[var(--radius-sm)] bg-white/[0.03] border border-white/[0.06]">
        <div className="flex items-center gap-2">
          <button
            className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-[11px] font-medium border transition-all duration-200 cursor-pointer ${
              micTesting
                ? 'bg-red-500/20 border-red-400/30 text-red-300 hover:bg-red-500/30'
                : 'bg-white/[0.06] border-white/10 text-white/70 hover:bg-white/[0.1]'
            }`}
            onClick={startMicTest}
          >
            {micTesting ? 'Stop Test' : 'Test Microphone'}
          </button>
          {micTesting && (
            <span className="text-[10px] text-white/40">Speak to hear playback</span>
          )}
        </div>
        {micTesting && (
          <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-75 bg-emerald-400/70"
              style={{ width: `${micLevel * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Auto-silence toggle */}
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
