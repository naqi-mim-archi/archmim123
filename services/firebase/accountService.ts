import {
  deleteUser,
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  type User,
} from 'firebase/auth';
import { deleteDoc, doc, getDoc } from 'firebase/firestore';
import { deleteObject, listAll, ref, type StorageReference } from 'firebase/storage';
import { getFirebaseAuth, getFirebaseDb, getFirebaseStorage } from './firebaseConfig';
import { deleteProject, listProjects, loadProject } from './projectsService';
import { deleteRenderSession, listRenderSessions } from './renderSessionsService';

const requireUser = (): User => {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  return user;
};

export const usesPasswordSignIn = (user: User | null): boolean =>
  !!user?.providerData.some(provider => provider.providerId === 'password');

export const buildAccountExport = async () => {
  const user = requireUser();
  let profile: Record<string, unknown> | null = null;
  try {
    const snap = await getDoc(doc(getFirebaseDb(), 'users', user.uid));
    profile = snap.exists() ? snap.data() : null;
  } catch {
    profile = null;
  }
  const summaries = await listProjects(user.uid);
  const projects = [];
  for (const summary of summaries) {
    try {
      projects.push({ ...summary, project: await loadProject(user.uid, summary.id) });
    } catch (err: any) {
      projects.push({ ...summary, project: null, error: err?.message || String(err) });
    }
  }
  return {
    exportedAt: new Date().toISOString(),
    account: {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      createdAt: user.metadata.creationTime || null,
      providers: user.providerData.map(provider => provider.providerId),
    },
    profile,
    projects,
  };
};

export const downloadAccountExport = async (): Promise<number> => {
  const data = await buildAccountExport();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `archai-account-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return data.projects.length;
};

const deleteFolder = async (folder: StorageReference): Promise<void> => {
  const listing = await listAll(folder);
  await Promise.all(listing.items.map(item => deleteObject(item).catch(() => undefined)));
  for (const prefix of listing.prefixes) await deleteFolder(prefix);
};

// Throws auth/requires-recent-login when Firebase wants a fresh sign-in; the UI then asks the user to re-authenticate.
export const deleteAccount = async (onProgress?: (message: string) => void): Promise<void> => {
  const user = requireUser();
  const projects = await listProjects(user.uid);
  onProgress?.(`Deleting ${projects.length} saved project${projects.length === 1 ? '' : 's'}…`);
  for (const project of projects) await deleteProject(user.uid, project.id);
  const sessions = await listRenderSessions(user.uid).catch(() => []);
  if (sessions.length) onProgress?.(`Deleting ${sessions.length} render session${sessions.length === 1 ? '' : 's'}…`);
  for (const session of sessions) await deleteRenderSession(user.uid, session.id).catch(() => undefined);
  onProgress?.('Deleting stored files…');
  await deleteFolder(ref(getFirebaseStorage(), `users/${user.uid}`)).catch(() => undefined);
  onProgress?.('Deleting profile…');
  await deleteDoc(doc(getFirebaseDb(), 'users', user.uid)).catch(() => undefined);
  onProgress?.('Deleting account…');
  await deleteUser(user);
};

export const reauthenticate = async (password?: string): Promise<void> => {
  const user = requireUser();
  if (usesPasswordSignIn(user)) {
    if (!password) throw new Error('Enter your password to confirm.');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email || '', password));
    return;
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await reauthenticateWithPopup(user, provider);
};
