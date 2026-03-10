import { create } from 'zustand';
import { useSessionStore } from './sessionStore';
import { useDataStore } from './dataStore';
import { useMapStore } from './mapStore';
import { useDrawStore } from './drawStore';
import { useArtilleryStore } from './artilleryStore';
import { useVoiceStore } from './voiceStore';
import { session } from '../multiplayer/sessionManager';
import { voice } from '../multiplayer/voiceManager';
import { clearAllStrokes } from '../map/drawing';
import { clearAll as clearAllArtillery } from '../map/artillery';
import { resetDetailMode } from '../map/detailView';
import { clearHexCaches } from '../data/store';

type AppView = 'menu' | 'app';

interface AppState {
  appView: AppView;
  enterApp: () => void;
  returnToMenu: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  appView: 'menu',
  enterApp: () => set({ appView: 'app' }),
  returnToMenu: () => {
    if (useVoiceStore.getState().joined) {
      voice.leaveVoice();
    }
    session.disconnect();
    useSessionStore.getState().reset();
    useDataStore.getState().reset();
    useMapStore.getState().reset();
    useDrawStore.getState().reset();
    useArtilleryStore.getState().reset();
    resetDetailMode();
    clearAllStrokes();
    const map = useMapStore.getState().mapInstance;
    if (map) clearAllArtillery(map);
    clearHexCaches();
    set({ appView: 'menu' });
  },
}));
