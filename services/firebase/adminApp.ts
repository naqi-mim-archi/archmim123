import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getDatabaseWithUrl, type Database } from 'firebase-admin/database';

// Owns the single firebase-admin app (Firestore + Storage only; ID tokens are verified in verifyIdToken.ts).

const APP_NAME = 'archai-admin';

interface ServiceAccount {
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

let cached: { app: App | null; serviceAccount: ServiceAccount | null; error: string | null } | null = null;

export const getFirebaseProjectId = (): string =>
  process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '';

const parseServiceAccount = (): { serviceAccount: ServiceAccount | null; error: string | null } => {
  let raw = (process.env.FIREBASE_ADMIN_SA_KEY_JSON || '').trim();
  if (!raw) return { serviceAccount: null, error: null };
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"') && !raw.startsWith('{'))) {
    raw = raw.slice(1, -1);
  }
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) {
      return { serviceAccount: null, error: 'FIREBASE_ADMIN_SA_KEY_JSON is missing client_email or private_key.' };
    }
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    return { serviceAccount: parsed, error: null };
  } catch {
    return { serviceAccount: null, error: 'FIREBASE_ADMIN_SA_KEY_JSON is not valid JSON.' };
  }
};

const getAdmin = () => {
  if (cached) return cached;
  const { serviceAccount, error } = parseServiceAccount();
  if (!serviceAccount) {
    cached = { app: null, serviceAccount: null, error };
    return cached;
  }
  try {
    const projectId = getFirebaseProjectId() || serviceAccount.project_id;
    const existing = getApps().find(app => app.name === APP_NAME);
    const app = existing || initializeApp({
      credential: cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key,
      }),
      projectId,
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || (projectId ? `${projectId}.firebasestorage.app` : undefined),
    }, APP_NAME);
    cached = { app, serviceAccount, error: null };
  } catch (err: any) {
    cached = { app: null, serviceAccount, error: `firebase-admin failed to initialise: ${err?.message || err}` };
  }
  return cached;
};

export const hasAdminCredentials = (): boolean => !!getAdmin().app;

export const getAdminFirestore = (): Firestore => {
  const { app, error } = getAdmin();
  if (!app) throw new Error(error || 'FIREBASE_ADMIN_SA_KEY_JSON is not configured.');
  return getFirestore(app);
};

export const getRealtimeDbUrl = (): string =>
  process.env.FIREBASE_DATABASE_URL || process.env.VITE_FIREBASE_DATABASE_URL || '';

// Realtime Database (live co-editing access list).
export const getAdminDatabase = (): Database => {
  const { app, error } = getAdmin();
  if (!app) throw new Error(error || 'FIREBASE_ADMIN_SA_KEY_JSON is not configured.');
  const url = getRealtimeDbUrl();
  if (!url) throw new Error('VITE_FIREBASE_DATABASE_URL is not configured.');
  return getDatabaseWithUrl(url, app);
};

export const getAdminStorageBucket = () => {
  const { app, error } = getAdmin();
  if (!app) throw new Error(error || 'FIREBASE_ADMIN_SA_KEY_JSON is not configured.');
  return getStorage(app).bucket();
};

export const getAdminConfigStatus = () => {
  const { app, serviceAccount, error } = getAdmin();
  return {
    projectId: getFirebaseProjectId() || null,
    hasServiceAccount: !!app,
    serviceAccountEmail: serviceAccount?.client_email || null,
    serviceAccountProjectId: serviceAccount?.project_id || null,
    error,
  };
};
