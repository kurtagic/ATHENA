import { useEffect, useRef } from 'react';
import { useVoiceStore } from '../stores/voiceStore';
import { useSettingsStore } from '../stores/settingsStore';

export function useVoiceSilencer(): void {
  const isMutedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubVoice = useVoiceStore.subscribe((state) => {
      const settings = useSettingsStore.getState().settings;
      if (!settings?.audio.autoSilenceOnVoice) {
        // If setting is off but we're currently muted, unmute
        if (isMutedRef.current) {
          if (timerRef.current) clearTimeout(timerRef.current);
          window.athena.setAppSilence(false);
          isMutedRef.current = false;
        }
        return;
      }

      const anyActive = state.pttActive || state.peers.some((p) => p.speaking);

      if (anyActive) {
        // Mute immediately
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        if (!isMutedRef.current) {
          window.athena.setAppSilence(true);
          isMutedRef.current = true;
        }
      } else {
        // Unmute with 100ms debounce
        if (isMutedRef.current && !timerRef.current) {
          timerRef.current = setTimeout(() => {
            window.athena.setAppSilence(false);
            isMutedRef.current = false;
            timerRef.current = null;
          }, 100);
        }
      }
    });

    const unsubSettings = useSettingsStore.subscribe((state) => {
      if (!state.settings?.audio.autoSilenceOnVoice && isMutedRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current);
        window.athena.setAppSilence(false);
        isMutedRef.current = false;
      }
    });

    return () => {
      unsubVoice();
      unsubSettings();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (isMutedRef.current) {
        window.athena.setAppSilence(false);
        isMutedRef.current = false;
      }
    };
  }, []);
}
