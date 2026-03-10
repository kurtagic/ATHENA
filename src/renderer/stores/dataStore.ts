import { create } from 'zustand';

interface DataState {
  warStatus: any | null;
  setWarStatus: (data: any) => void;
  reset: () => void;
}

export const useDataStore = create<DataState>((set) => ({
  warStatus: null,
  setWarStatus: (data) => set({ warStatus: data }),
  reset: () => set({ warStatus: null }),
}));
