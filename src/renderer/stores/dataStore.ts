import { create } from 'zustand';

interface DataState {
  warStatus: any | null;
  setWarStatus: (data: any) => void;
}

export const useDataStore = create<DataState>((set) => ({
  warStatus: null,
  setWarStatus: (data) => set({ warStatus: data }),
}));
