import { create } from "zustand";
import { supabase } from "../services/supabase";
import { User } from "../types";
import { api } from "../services/api";
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  init: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  updateUser: (partial: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  init: async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        // Fetch/create our app user profile
        try {
          const user = (await api.getMe()) as User;
          set({ user, isAuthenticated: true, isLoading: false });
        } catch {
          set({ isAuthenticated: true, isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }

      // Listen for auth state changes
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (session) {
          try {
            const user = (await api.getMe()) as User;
            set({ user, isAuthenticated: true });
          } catch {
            set({ isAuthenticated: true });
          }
        } else {
          set({ user: null, isAuthenticated: false });
        }
      });
    } catch {
      set({ isLoading: false });
    }
  },

  signInWithGoogle: async () => {
    set({ isLoading: true, error: null });
    try {
      const redirectUrl = makeRedirectUri({ path: "auth/callback" });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectUrl },
      });
      if (error) throw error;
      if (data.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectUrl,
        );
        if (result.type === "success") {
          const url = new URL(result.url);
          // Extract tokens from the URL fragment
          const params = new URLSearchParams(
            url.hash ? url.hash.substring(1) : url.search.substring(1),
          );
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");
          if (accessToken && refreshToken) {
            const { data: sessionData } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionData.session) {
              try {
                const user = (await api.getMe()) as User;
                set({ user, isAuthenticated: true, isLoading: false });
                return;
              } catch {
                set({ isAuthenticated: true, isLoading: false });
                return;
              }
            }
          }
        }
      }
      set({ isLoading: false });
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ user: null, isAuthenticated: false });
  },

  clearError: () => set({ error: null }),

  updateUser: (partial) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...partial } : state.user,
    })),
}));
