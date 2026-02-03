import { create } from 'zustand';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  nickname: string | null;
  photoURL: string | null;
}

interface AuthStore {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAuthReady: boolean;
  googleAccessToken: string | null;
  googleAccessTokenExpiresAt: number | null;
  setUser: (user: AuthUser | null) => void;
  setAuthReady: (ready: boolean) => void;
  setGoogleAccessToken: (
    token: string | null,
    expiresAt: number | null,
  ) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  isAuthReady: false,
  googleAccessToken: null,
  googleAccessTokenExpiresAt: null,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setAuthReady: (ready) => set({ isAuthReady: ready }),
  setGoogleAccessToken: (token, expiresAt) =>
    set({
      googleAccessToken: token,
      googleAccessTokenExpiresAt: expiresAt,
    }),
  reset: () =>
    set({
      user: null,
      isAuthenticated: false,
      isAuthReady: false,
      googleAccessToken: null,
      googleAccessTokenExpiresAt: null,
    }),
}));
