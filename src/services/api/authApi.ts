import {
  GoogleAuthProvider,
  type User,
  type UserCredential,
  browserLocalPersistence,
  browserSessionPersistence,
  getRedirectResult,
  indexedDBLocalPersistence,
  onAuthStateChanged,
  reauthenticateWithPopup,
  reauthenticateWithRedirect,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { auth, db, isFirestoreOfflineError } from '@/services/firebase';
import { type AuthUser, useAuthStore } from '@/store/useAuthStore';

const GOOGLE_ACCESS_TOKEN_KEY = 'google-access-token';
const GOOGLE_ACCESS_TOKEN_EXPIRY_KEY = 'google-access-token-expiry';
const DEFAULT_TOKEN_LIFETIME_MS = 55 * 60 * 1000;

const calendarScopes = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.app.created',
];

type UserProfileDoc = {
  nickname?: string | null;
  photoURL?: string | null;
  email?: string | null;
  displayName?: string | null;
};

const buildProvider = () => {
  const provider = new GoogleAuthProvider();
  calendarScopes.forEach((scope) => provider.addScope(scope));
  provider.setCustomParameters({ prompt: 'consent', access_type: 'online' });
  return provider;
};

const buildFallbackNickname = (user: User) =>
  user.displayName ?? user.email ?? null;

const toAuthUser = (user: User, profile?: UserProfileDoc): AuthUser => ({
  uid: user.uid,
  email: user.email,
  displayName: user.displayName,
  nickname: profile?.nickname ?? buildFallbackNickname(user),
  photoURL: profile?.photoURL ?? user.photoURL,
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
  const existingData = existing.exists()
    ? (existing.data() as UserProfileDoc)
    : null;
  const nickname = existingData?.nickname ?? buildFallbackNickname(user);
  const photoURL = existingData?.photoURL ?? user.photoURL ?? null;
  const basePayload = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    nickname,
    photoURL,
    updatedAt: serverTimestamp(),
  };
  const payload = existing.exists()
    ? basePayload
    : { ...basePayload, createdAt: serverTimestamp() };
  await setDoc(userRef, payload, { merge: true });
};

const getUserProfile = async (user: User) => {
  const userRef = doc(db, 'users', user.uid);
  const snapshot = await getDoc(userRef);
  const fallbackNickname = buildFallbackNickname(user);
  const fallbackPhotoURL = user.photoURL ?? null;

  if (!snapshot.exists()) {
    const payload = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      nickname: fallbackNickname,
      photoURL: fallbackPhotoURL,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(userRef, payload, { merge: true });
    return payload;
  }

  const data = snapshot.data() as UserProfileDoc;
  const nickname = data.nickname ?? fallbackNickname;
  const photoURL = data.photoURL ?? fallbackPhotoURL;

  const needsNickname = !data.nickname && nickname;
  const needsPhotoURL = !data.photoURL && photoURL;
  if (needsNickname || needsPhotoURL) {
    await setDoc(
      userRef,
      {
        ...(needsNickname ? { nickname } : {}),
        ...(needsPhotoURL ? { photoURL } : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  return { ...data, nickname, photoURL };
};

const updateShareLinksForOwner = async (
  uid: string,
  ownerNickname: string,
  ownerPhotoURL: string | null,
) => {
  const snapshot = await getDocs(
    query(collection(db, 'shareLinks'), where('ownerUid', '==', uid)),
  );
  if (snapshot.empty) return;
  const batch = writeBatch(db);
  snapshot.docs.forEach((docSnap) => {
    batch.set(
      docSnap.ref,
      {
        ownerNickname,
        ownerPhotoURL,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
  await batch.commit();
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

const updateStoreUser = async (user: User) => {
  const { setUser, setAuthReady } = useAuthStore.getState();
  try {
    const profile = await getUserProfile(user);
    setUser(toAuthUser(user, profile));
  } catch (error) {
    if (!isFirestoreOfflineError(error)) {
      console.error('Failed to load user profile:', error);
    }
    setUser(toAuthUser(user));
  } finally {
    setAuthReady(true);
  }
};

const isIOSDevice = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isIPadOS = /macintosh/.test(ua) && 'ontouchend' in window;
  return isIOS || isIPadOS;
};

const isStandalonePwa = () => {
  if (typeof window === 'undefined') return false;
  const standaloneMatch =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    'standalone' in navigator &&
    Boolean((navigator as { standalone?: boolean }).standalone);
  return Boolean(standaloneMatch || iosStandalone);
};

const shouldUseRedirect = () => isStandalonePwa();

const setBestPersistence = async () => {
  const candidates =
    isStandalonePwa() && isIOSDevice()
      ? [browserLocalPersistence, indexedDBLocalPersistence]
      : [
          indexedDBLocalPersistence,
          browserLocalPersistence,
          browserSessionPersistence,
        ];

  for (const persistence of candidates) {
    try {
      await setPersistence(auth, persistence);
      return persistence;
    } catch {
      // Try next persistence option.
    }
  }

  return null;
};

export const authApi = {
  googleLogin: async () => {
    await setBestPersistence();
    const provider = buildProvider();
    if (shouldUseRedirect()) {
      await signInWithRedirect(auth, provider);
      return null;
    }
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

  completeRedirectSignIn: async () => {
    const persistence = await setBestPersistence();
    const result = await getRedirectResult(auth);
    if (!result) {
      const user = await new Promise<User | null>((resolve) => {
        const timeout = window.setTimeout(() => resolve(auth.currentUser), 5000);
        const unsubscribe = onAuthStateChanged(auth, (authUser) => {
          window.clearTimeout(timeout);
          unsubscribe();
          resolve(authUser);
        });
      });
      if (user) {
        await updateStoreUser(user);
      } else {
        const { setAuthReady } = useAuthStore.getState();
        setAuthReady(true);
      }
      return {
        user,
        hasRedirectResult: false,
        persistence: persistence?.type ?? null,
      };
    }
    const tokenData = extractAccessToken(
      result as UserCredential & { _tokenResponse?: { expiresIn?: string } },
    );
    if (tokenData?.accessToken) {
      storeToken(tokenData.accessToken, tokenData.expiresAt);
    }
    if (result.user) {
      await upsertUserProfile(result.user);
      await updateStoreUser(result.user);
    }
    return {
      user: result.user ?? auth.currentUser,
      hasRedirectResult: true,
      persistence: persistence?.type ?? null,
    };
  },

  getGoogleAccessToken: async () => {
    const { token, expiresAt } = getStoredToken();
    if (token && Date.now() < expiresAt - 60_000) {
      return token;
    }

    if (!auth.currentUser) {
      throw new Error('로그인이 필요합니다.');
    }

    const provider = buildProvider();
    if (shouldUseRedirect()) {
      await setBestPersistence();
      await reauthenticateWithRedirect(auth.currentUser, provider);
      throw new Error('리디렉트 인증이 필요합니다.');
    }
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
    const profile = await getUserProfile(auth.currentUser);
    return toAuthUser(auth.currentUser, profile);
  },

  updateUserProfile: async (data: {
    nickname: string;
    photoURL?: string | null;
  }) => {
    if (!auth.currentUser) {
      throw new Error('로그인이 필요합니다.');
    }
    const userRef = doc(db, 'users', auth.currentUser.uid);
    const payload = {
      nickname: data.nickname,
      photoURL: data.photoURL ?? null,
      updatedAt: serverTimestamp(),
    };
    await setDoc(userRef, payload, { merge: true });
    updateShareLinksForOwner(
      auth.currentUser.uid,
      data.nickname,
      data.photoURL ?? null,
    ).catch((error) => {
      console.error('Failed to sync share links:', error);
    });

    const { user, setUser } = useAuthStore.getState();
    if (user) {
      setUser({
        ...user,
        nickname: data.nickname,
        photoURL: data.photoURL ?? null,
      });
    }

    return payload;
  },

  ensureNickname: async () => {
    if (!auth.currentUser) {
      return null;
    }
    const profile = await getUserProfile(auth.currentUser);
    const { setUser } = useAuthStore.getState();
    setUser(toAuthUser(auth.currentUser, profile));
    return profile;
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
        getUserProfile(user)
          .then((profile) => {
            setUser(toAuthUser(user, profile));
          })
          .catch((error) => {
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
