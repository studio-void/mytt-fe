import {
  GoogleAuthProvider,
  type User,
  type UserCredential,
  browserLocalPersistence,
  onAuthStateChanged,
  reauthenticateWithPopup,
  setPersistence,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { auth, db, isFirestoreOfflineError } from '@/services/firebase';
import { type AuthUser, useAuthStore } from '@/store/useAuthStore';

const GOOGLE_ACCESS_TOKEN_KEY = 'google-access-token';
const GOOGLE_ACCESS_TOKEN_EXPIRY_KEY = 'google-access-token-expiry';
const DEFAULT_TOKEN_LIFETIME_MS = 55 * 60 * 1000;

const calendarScopes = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.app.created',
];

const buildProvider = () => {
  const provider = new GoogleAuthProvider();
  calendarScopes.forEach((scope) => provider.addScope(scope));
  provider.setCustomParameters({ prompt: 'consent', access_type: 'online' });
  return provider;
};

const toAuthUser = (user: User): AuthUser => ({
  uid: user.uid,
  email: user.email,
  displayName: user.displayName,
  photoURL: user.photoURL,
});

const getStoredToken = () => {
  const token = localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
  const expiresAt = Number(
    localStorage.getItem(GOOGLE_ACCESS_TOKEN_EXPIRY_KEY) || 0,
  );
  return { token, expiresAt };
};

const storeToken = (token: string, expiresAt: number) => {
  localStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, token);
  localStorage.setItem(GOOGLE_ACCESS_TOKEN_EXPIRY_KEY, String(expiresAt));
  const { setGoogleAccessToken } = useAuthStore.getState();
  setGoogleAccessToken(token, expiresAt);
};

const clearStoredToken = () => {
  localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
  localStorage.removeItem(GOOGLE_ACCESS_TOKEN_EXPIRY_KEY);
  const { setGoogleAccessToken } = useAuthStore.getState();
  setGoogleAccessToken(null, null);
};

const extractAccessToken = (
  result: UserCredential & { _tokenResponse?: { expiresIn?: string } },
) => {
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken || null;
  const expiresIn = Number(result._tokenResponse?.expiresIn || 0);
  const expiresAt =
    Date.now() + (expiresIn ? expiresIn * 1000 : DEFAULT_TOKEN_LIFETIME_MS);
  return accessToken ? { accessToken, expiresAt } : null;
};

const upsertUserProfile = async (user: User) => {
  const userRef = doc(db, 'users', user.uid);
  const existing = await getDoc(userRef);
  const basePayload = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    updatedAt: serverTimestamp(),
  };
  const payload = existing.exists()
    ? basePayload
    : { ...basePayload, createdAt: serverTimestamp() };
  await setDoc(userRef, payload, { merge: true });
};

const retryProfileSyncWhenOnline = (user: User) => {
  if (typeof window === 'undefined') return;
  const handler = async () => {
    try {
      await upsertUserProfile(user);
    } catch (error) {
      if (isFirestoreOfflineError(error)) {
        return;
      }
      console.error('Failed to sync user profile:', error);
    } finally {
      window.removeEventListener('online', handler);
    }
  };
  window.addEventListener('online', handler);
};

export const authApi = {
  googleLogin: async () => {
    await setPersistence(auth, browserLocalPersistence);
    const provider = buildProvider();
    const result = await signInWithPopup(auth, provider);
    const tokenData = extractAccessToken(
      result as UserCredential & { _tokenResponse?: { expiresIn?: string } },
    );
    if (tokenData?.accessToken) {
      storeToken(tokenData.accessToken, tokenData.expiresAt);
    }
    if (result.user) {
      await upsertUserProfile(result.user);
    }
    return result.user;
  },

  logout: async () => {
    await signOut(auth);
    clearStoredToken();
  },

  observeAuthState: (callback: (user: User | null) => void) =>
    onAuthStateChanged(auth, callback),

  getGoogleAccessToken: async () => {
    const { token, expiresAt } = getStoredToken();
    if (token && Date.now() < expiresAt - 60_000) {
      return token;
    }

    if (!auth.currentUser) {
      throw new Error('로그인이 필요합니다.');
    }

    const provider = buildProvider();
    const result = await reauthenticateWithPopup(auth.currentUser, provider);
    const tokenData = extractAccessToken(
      result as UserCredential & { _tokenResponse?: { expiresIn?: string } },
    );
    if (!tokenData?.accessToken) {
      throw new Error('Google 인증 토큰을 가져오지 못했습니다.');
    }

    storeToken(tokenData.accessToken, tokenData.expiresAt);
    return tokenData.accessToken;
  },

  getProfile: async () => {
    if (!auth.currentUser) {
      throw new Error('로그인이 필요합니다.');
    }
    await upsertUserProfile(auth.currentUser);
    return toAuthUser(auth.currentUser);
  },

  hydrateStoreFromAuth: () => {
    const { setUser, setAuthReady, setGoogleAccessToken } =
      useAuthStore.getState();
    const { token, expiresAt } = getStoredToken();
    if (token) {
      setGoogleAccessToken(token, expiresAt || null);
    }
    return onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(toAuthUser(user));
        upsertUserProfile(user).catch((error) => {
          if (isFirestoreOfflineError(error)) {
            retryProfileSyncWhenOnline(user);
            return;
          }
          console.error('Failed to sync user profile:', error);
        });
      } else {
        setUser(null);
      }
      setAuthReady(true);
    });
  },
};
