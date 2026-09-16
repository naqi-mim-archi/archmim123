import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes, uploadString, getDownloadURL } from 'firebase/storage';
import type { Project } from '../../types';
import { getFirebaseDb, getFirebaseStorage } from './firebaseConfig';
import { checkStorageAllowance } from '../billing/balanceClient';

// A payload under ~700 KB is stored inline in projects/{id}.data; anything larger goes to Storage.
export const INLINE_PROJECT_LIMIT_BYTES = 700 * 1024;

export interface CloudProjectSummary {
  id: string;
  name: string;
  mode: string;
  elementsCount: number;
  thumbnailUrl: string | null;
  storageMode: 'inline' | 'storage';
  updatedAt: Date | null;
  createdAt: Date | null;
}

export class StorageLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageLimitError';
  }
}

const projectPath = (uid: string, projectId: string) => `users/${uid}/projects/${projectId}`;

const toDate = (value: any): Date | null => (value && typeof value.toDate === 'function' ? value.toDate() : null);

const dataUrlBytes = (dataUrl: string) => Math.ceil(((dataUrl.split(',')[1] || '').length * 3) / 4);

export const saveProject = async (
  userId: string,
  project: Project,
  options: { projectId?: string | null; name?: string; thumbnailDataUrl?: string | null } = {},
): Promise<{ projectId: string; storageMode: 'inline' | 'storage' }> => {
  const db = getFirebaseDb();
  const storage = getFirebaseStorage();
  const json = JSON.stringify(project);
  const payloadBytes = new Blob([json]).size;
  const storageMode: 'inline' | 'storage' = payloadBytes < INLINE_PROJECT_LIMIT_BYTES ? 'inline' : 'storage';
  const thumbnailBytes = options.thumbnailDataUrl ? dataUrlBytes(options.thumbnailDataUrl) : 0;

  // Check before any write that goes to Storage.
  const storageBoundBytes = thumbnailBytes + (storageMode === 'storage' ? payloadBytes : 0);
  if (storageBoundBytes > 0) {
    const allowance = await checkStorageAllowance(storageBoundBytes);
    if (!allowance.allowed) {
      throw new StorageLimitError(allowance.message || 'This save would take you past your storage limit.');
    }
  }

  // Passing projectId updates in place; leaving it out creates a new project (never a silent duplicate).
  let projectId = options.projectId || null;
  if (projectId) {
    try {
      const existing = await getDoc(doc(db, 'projects', projectId));
      if (!existing.exists() || existing.data()?.ownerId !== userId) projectId = null;
    } catch {
      projectId = null; // deleted or not ours (rules deny the read)
    }
  }
  const isNew = !projectId;
  if (!projectId) projectId = doc(collection(db, 'projects')).id;
  const base = projectPath(userId, projectId);

  let thumbnailUrl: string | null = null;
  if (options.thumbnailDataUrl) {
    const thumbRef = ref(storage, `${base}/thumbnail.jpg`);
    await uploadString(thumbRef, options.thumbnailDataUrl, 'data_url', { contentType: 'image/jpeg' });
    thumbnailUrl = await getDownloadURL(thumbRef);
  }

  let dataUrl: string | null = null;
  if (storageMode === 'storage') {
    const dataRef = ref(storage, `${base}/project.json`);
    await uploadBytes(dataRef, new Blob([json], { type: 'application/json' }), { contentType: 'application/json' });
    dataUrl = await getDownloadURL(dataRef);
  }

  const record: Record<string, unknown> = {
    ownerId: userId,
    name: (options.name || project.name || 'Untitled Plan').slice(0, 200),
    mode: String(project.mode || 'floorplan').slice(0, 60),
    elementsCount: Array.isArray(project.elements) ? project.elements.length : 0,
    thumbnailUrl,
    storageMode,
    data: storageMode === 'inline' ? json : null,
    dataUrl,
    updatedAt: serverTimestamp(),
  };
  if (isNew) record.createdAt = serverTimestamp();

  await setDoc(doc(db, 'projects', projectId), record, { merge: !isNew });

  // A project that shrank back to inline no longer needs its Storage copy.
  if (!isNew && storageMode === 'inline') {
    deleteObject(ref(storage, `${base}/project.json`)).catch(() => undefined);
  }
  return { projectId, storageMode };
};

export const listProjects = async (userId: string): Promise<CloudProjectSummary[]> => {
  const snap = await getDocs(query(collection(getFirebaseDb(), 'projects'), where('ownerId', '==', userId)));
  return snap.docs
    .map(entry => {
      const data = entry.data();
      return {
        id: entry.id,
        name: data.name || 'Untitled Plan',
        mode: data.mode || 'floorplan',
        elementsCount: Number(data.elementsCount) || 0,
        thumbnailUrl: data.thumbnailUrl || null,
        storageMode: data.storageMode === 'storage' ? 'storage' : 'inline',
        updatedAt: toDate(data.updatedAt),
        createdAt: toDate(data.createdAt),
      } as CloudProjectSummary;
    })
    .sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0));
};

export const loadProject = async (userId: string, projectId: string): Promise<Project> => {
  const snap = await getDoc(doc(getFirebaseDb(), 'projects', projectId));
  if (!snap.exists() || snap.data()?.ownerId !== userId) throw new Error('Project not found.');
  const data = snap.data();
  if (data.storageMode === 'storage') {
    const bytes = await getBytes(ref(getFirebaseStorage(), `${projectPath(userId, projectId)}/project.json`));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  return JSON.parse(data.data);
};

export const deleteProject = async (userId: string, projectId: string): Promise<void> => {
  const storage = getFirebaseStorage();
  const base = projectPath(userId, projectId);
  await Promise.all(['project.json', 'thumbnail.jpg'].map(name => deleteObject(ref(storage, `${base}/${name}`)).catch(() => undefined)));
  await deleteDoc(doc(getFirebaseDb(), 'projects', projectId));
};
