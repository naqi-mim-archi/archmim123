import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getDatabase, type Database } from 'firebase/database';

// The Firebase web config is public by design (not a secret).
const env = (import.meta as any).env || {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL as string | undefined,
};

// Without these the whole account layer turns itself off.
export const isFirebaseConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId);

// Live presence needs the Realtime Database, which is optional: without the URL the
// whole presence layer stays switched off instead of erroring.
export const isRealtimeDbConfigured = isFirebaseConfigured && !!firebaseConfig.databaseURL;

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let realtimeDb: Database | null = null;

const getFirebaseApp = (): FirebaseApp => {
  if (!isFirebaseConfigured) throw new Error("Firebase isn't configured for this deployment.");
  app ||= getApps()[0] || initializeApp(firebaseConfig);
  return app;
};

export const getFirebaseAuth = (): Auth => (auth ||= getAuth(getFirebaseApp()));
export const getFirebaseDb = (): Firestore => (db ||= getFirestore(getFirebaseApp()));
export const getFirebaseStorage = (): FirebaseStorage => (storage ||= getStorage(getFirebaseApp()));

export const getFirebaseDatabase = (): Database => {
  if (!isRealtimeDbConfigured) throw new Error('VITE_FIREBASE_DATABASE_URL is not set for this deployment.');
  return (realtimeDb ||= getDatabase(getFirebaseApp()));
};
