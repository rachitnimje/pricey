import { create } from "zustand";
import { api } from "../services/api";
import { Comparison, PriceAlert } from "../types";

interface AppState {
  // Comparisons
  comparisons: Comparison[];
  currentComparison: Comparison | null;
  isLoadingComparisons: boolean;

  // Alerts
  alerts: PriceAlert[];
  isLoadingAlerts: boolean;

  // Scraping state
  scrapingProgress: Map<
    string,
    { index: number; total: number; status: string }
  >;

  // Actions
  fetchComparisons: () => Promise<void>;
  fetchComparison: (id: string) => Promise<void>;
  createComparison: (name: string, urls: string[]) => Promise<Comparison>;
  deleteComparison: (id: string) => Promise<void>;
  refreshComparison: (id: string) => Promise<void>;
  addURLsToComparison: (id: string, urls: string[]) => Promise<void>;
  updateComparison: (
    id: string,
    data: { name?: string; is_active?: boolean },
  ) => Promise<void>;
  fetchAlerts: () => Promise<void>;
  createAlert: (data: {
    product_id?: string;
    comparison_id: string;
    target_price: number;
    channels: string[];
  }) => Promise<void>;
  updateAlert: (
    id: string,
    data: { target_price: number; is_active?: boolean; channels?: string[] },
  ) => Promise<void>;
  deleteAlert: (id: string) => Promise<void>;
  setScrapeProgress: (
    comparisonId: string,
    index: number,
    total: number,
    status: string,
  ) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  comparisons: [],
  currentComparison: null,
  isLoadingComparisons: false,
  alerts: [],
  isLoadingAlerts: false,
  scrapingProgress: new Map(),

  fetchComparisons: async () => {
    set({ isLoadingComparisons: true });
    try {
      const data = (await api.getComparisons()) as Comparison[];
      set({ comparisons: data || [], isLoadingComparisons: false });
    } catch {
      set({ isLoadingComparisons: false });
    }
  },

  fetchComparison: async (id) => {
    try {
      const data = (await api.getComparison(id)) as Comparison;
      set({ currentComparison: data });
    } catch {
      // silent fail
    }
  },

  createComparison: async (name, urls) => {
    const data = (await api.createComparison(name, urls)) as Comparison;
    set((state) => ({ comparisons: [data, ...state.comparisons] }));
    return data;
  },

  deleteComparison: async (id) => {
    await api.deleteComparison(id);
    set((state) => ({
      comparisons: state.comparisons.filter((c) => c.id !== id),
    }));
  },

  refreshComparison: async (id) => {
    await api.refreshComparison(id);
  },

  addURLsToComparison: async (id, urls) => {
    const data = (await api.addURLsToComparison(id, urls)) as Comparison;
    set({ currentComparison: data });
  },

  updateComparison: async (id, data) => {
    await api.updateComparison(id, data);
    set((state) => ({
      comparisons: state.comparisons.map((c) =>
        c.id === id ? { ...c, ...data } : c,
      ),
      currentComparison:
        state.currentComparison?.id === id
          ? { ...state.currentComparison, ...data }
          : state.currentComparison,
    }));
  },

  fetchAlerts: async () => {
    set({ isLoadingAlerts: true });
    try {
      const data = (await api.getAlerts()) as PriceAlert[];
      set({ alerts: data || [], isLoadingAlerts: false });
    } catch {
      set({ isLoadingAlerts: false });
    }
  },

  createAlert: async (data) => {
    const alert = (await api.createAlert(data)) as PriceAlert;
    set((state) => ({ alerts: [alert, ...state.alerts] }));
  },

  updateAlert: async (id, data) => {
    await api.updateAlert(id, data);
    set((state) => ({
      alerts: state.alerts.map((a) => (a.id === id ? { ...a, ...data } : a)),
    }));
  },

  deleteAlert: async (id) => {
    await api.deleteAlert(id);
    set((state) => ({
      alerts: state.alerts.filter((a) => a.id !== id),
    }));
  },

  setScrapeProgress: (comparisonId, index, total, status) => {
    set((state) => {
      const progress = new Map(state.scrapingProgress);
      progress.set(comparisonId, { index, total, status });
      return { scrapingProgress: progress };
    });
  },
}));
