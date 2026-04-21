import { create } from 'zustand';
import { api, type Camera, type GlobalStats } from '../services/api';

export interface Alert {
  id: string;
  timestamp: number;
  cameraName: string;
  confidence: number;
  severity: 'low' | 'medium' | 'high';
  message?: string;
}

interface AppState {
  activeCameraId: string | null;
  setActiveCamera: (id: string | null) => void;

  cameras: Camera[];
  fetchCameras: () => Promise<void>;

  globalStats: GlobalStats | null;
  fetchStats: () => Promise<void>;

  alerts: Alert[];
  addAlert: (alert: Alert) => void;
  dismissAlert: (id: string) => void;
  clearAlerts: () => void;

  isRadarActive: boolean;
  toggleRadar: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  activeCameraId: null,
  setActiveCamera: (id) => set({ activeCameraId: id }),

  cameras: [],
  fetchCameras: async () => {
    try {
      const cameras = await api.getCameras();
      set({ cameras });
      const { activeCameraId } = get();
      if (activeCameraId && !cameras.find(c => c.id === activeCameraId)) {
        set({ activeCameraId: null });
      }
    } catch (e) {
      console.error('Failed to fetch cameras', e);
    }
  },

  globalStats: null,
  fetchStats: async () => {
    try {
      const globalStats = await api.getStats();
      set({ globalStats });
    } catch (e) {
      console.error('Failed to fetch stats', e);
    }
  },

  alerts: [],
  addAlert: (alert) => set((state) => ({ alerts: [alert, ...state.alerts].slice(0, 50) })),
  dismissAlert: (id) => set((state) => ({ alerts: state.alerts.filter(a => a.id !== id) })),
  clearAlerts: () => set({ alerts: [] }),

  isRadarActive: true,
  toggleRadar: () => set((state) => ({ isRadarActive: !state.isRadarActive })),
}));
