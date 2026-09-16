import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from './firebaseConfig';

const googleProvider = () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
};

// users/{uid} is client-writable: only these four keys ever go there (never plan or balance fields).
export const upsertUserProfile = async (user: User): Promise<void> => {
  await setDoc(doc(getFirebaseDb(), 'users', user.uid), {
    email: user.email || null,
    displayName: user.displayName || null,
    photoURL: user.photoURL || null,
    lastSignInAt: serverTimestamp(),
  }, { merge: true });
};

const upsertQuietly = (user: User) => upsertUserProfile(user).catch(err => console.warn('[Auth] Profile upsert failed:', err));

export const signUpWithEmail = async (email: string, password: string, displayName?: string): Promise<User> => {
  const { user } = await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  if (displayName?.trim()) await updateProfile(user, { displayName: displayName.trim() });
  await upsertQuietly(user);
  // Fire-and-forget: nothing is gated on verification.
  sendEmailVerification(user).catch(err => console.warn('[Auth] Verification email failed:', err));
  return user;
};

export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  const { user } = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  void upsertQuietly(user);
  return user;
};

const REDIRECT_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);

// Returns null when it fell back to a full-page redirect (the page is navigating away).
export const signInWithGoogle = async (): Promise<User | null> => {
  try {
    const { user } = await signInWithPopup(getFirebaseAuth(), googleProvider());
    void upsertQuietly(user);
    return user;
  } catch (err: any) {
    if (REDIRECT_FALLBACK_CODES.has(err?.code)) {
      await signInWithRedirect(getFirebaseAuth(), googleProvider());
      return null;
    }
    throw err;
  }
};

// Called once on app start to finish a Google redirect sign-in.
export const completeGoogleRedirectSignIn = async (): Promise<User | null> => {
  if (!isFirebaseConfigured) return null;
  const result = await getRedirectResult(getFirebaseAuth());
  if (result?.user) void upsertQuietly(result.user);
  return result?.user || null;
};

export const signOut = () => firebaseSignOut(getFirebaseAuth());

export const watchAuthState = (cb: (user: User | null) => void) => onAuthStateChanged(getFirebaseAuth(), cb);

// Never reveals whether an account exists.
export const sendPasswordReset = async (email: string): Promise<void> => {
  try {
    await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-credential') return;
    throw err;
  }
};

export const resendEmailVerification = async (): Promise<void> => {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  await sendEmailVerification(user);
};

export const updateDisplayName = async (displayName: string): Promise<void> => {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  await updateProfile(user, { displayName: displayName.trim() });
  await upsertUserProfile(user);
};

export const getFirebaseAuthErrorMessage = (err: any): string => {
  const code: string = err?.code || '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'That email is already registered — try signing in instead.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return 'Enter a valid email address.';
    case 'auth/weak-password':
      return 'Choose a password with at least 6 characters.';
    case 'auth/popup-blocked':
      return 'Allow popups for this site, or try again to continue in the same tab.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.';
    case 'auth/unauthorized-domain':
      return `This domain (${typeof window !== 'undefined' ? window.location.hostname : 'this site'}) isn't authorised for sign-in. An admin needs to add it in Firebase Console → Authentication → Settings → Authorized domains.`;
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error — check your connection and try again.';
    case 'auth/requires-recent-login':
      return 'For your security, please confirm it’s you before doing that.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled for this project.';
    default:
      return err?.message ? String(err.message).replace(/^Firebase:\s*/, '') : 'Something went wrong. Please try again.';
  }
};
