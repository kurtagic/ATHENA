import { create } from 'zustand';

interface BannerState {
  activeBanner: { command: 'fire' | 'stop'; id: number } | null;
  showBanner: (command: 'fire' | 'stop') => void;
  clearBanner: () => void;
}

let bannerId = 0;

export const useBannerStore = create<BannerState>((set, get) => ({
  activeBanner: null,
  showBanner: (command) => {
    const id = ++bannerId;
    set({ activeBanner: { command, id } });
    setTimeout(() => {
      if (get().activeBanner?.id === id) {
        set({ activeBanner: null });
      }
    }, 1500);
  },
  clearBanner: () => set({ activeBanner: null }),
}));
