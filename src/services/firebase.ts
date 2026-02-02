import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.authDomain) {
  console.error('Missing Firebase environment variables.');
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export const isFirestoreOfflineError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const message =
    'message' in error && typeof error.message === 'string'
      ? error.message.toLowerCase()
      : '';
  const code =
    'code' in error && typeof error.code === 'string'
      ? error.code.toLowerCase()
      : '';
  return (
    message.includes('client is offline') ||
    message.includes('failed to get document because the client is offline') ||
    code === 'unavailable'
  );
};

export const isFirestorePermissionError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const code =
    'code' in error && typeof error.code === 'string'
      ? error.code.toLowerCase()
      : '';
  return code === 'permission-denied';
};
