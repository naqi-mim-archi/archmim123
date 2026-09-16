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
import { resolveRole, type LinkAccess, type ProjectRole } from './shareAccess';

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
  ownerId: string;
  role: ProjectRole;
  linkAccess: LinkAccess;
  lastEditorName: string | null;
}

export class StorageLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageLimitError';
  }
}

// Someone else saved this project after we loaded it: ask before overwriting their work.
export class ConcurrentEditError extends Error {
  constructor(public readonly editorName: string, public readonly remoteUpdatedAtMs: number) {
    super(`${editorName} saved changes to this project after you opened it.`);
    this.name = 'ConcurrentEditError';
  }
}

const projectPath = (uid: string, projectId: string) => `users/${uid}/projects/${projectId}`;

const toDate = (value: any): Date | null => (value && typeof value.toDate === 'function' ? value.toDate() : null);

const dataUrlBytes = (dataUrl: string) => Math.ceil(((dataUrl.split(',')[1] || '').length * 3) / 4);

export const saveProject = async (
  userId: string,
  project: Project,
  options: {
    projectId?: string | null;
    name?: string;
    thumbnailDataUrl?: string | null;
    // The updatedAt we last saw; a newer stored copy raises ConcurrentEditError instead of overwriting.
    expectedUpdatedAtMs?: number | null;
    editorName?: string | null;
  } = {},
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
  let existingData: any = null;
  if (projectId) {
    try {
      const existing = await getDoc(doc(db, 'projects', projectId));
      const role = existing.exists() ? resolveRole(existing.data() as any, userId) : null;
      if (!existing.exists() || !(role === 'owner' || role === 'editor')) projectId = null;
      else existingData = existing.data();
    } catch {
      projectId = null; // deleted or not ours (rules deny the read)
    }
  }
  const isNew = !projectId;
  if (!projectId) projectId = doc(collection(db, 'projects')).id;

  // Someone else may have saved since this copy was opened.
  if (existingData && options.expectedUpdatedAtMs != null) {
    const remoteMs = existingData.updatedAt?.toMillis?.() ?? 0;
    if (remoteMs > options.expectedUpdatedAtMs) {
      throw new ConcurrentEditError(existingData.lastEditorName || 'Someone else', remoteMs);
    }
  }

  // Storage always lives under the owner's prefix, so their quota is the one that counts.
  const ownerId = existingData?.ownerId || userId;
  const base = projectPath(ownerId, projectId);

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
    ownerId,
    name: (options.name || project.name || 'Untitled Plan').slice(0, 200),
    mode: String(project.mode || 'floorplan').slice(0, 60),
    elementsCount: Array.isArray(project.elements) ? project.elements.length : 0,
    thumbnailUrl,
    storageMode,
    data: storageMode === 'inline' ? json : null,
    dataUrl,
    lastEditorUid: userId,
    lastEditorName: (options.editorName || 'Someone').slice(0, 120),
    updatedAt: serverTimestamp(),
  };
  if (isNew) {
    record.createdAt = serverTimestamp();
    record.linkAccess = 'none';
    record.members = {};
    record.memberIds = [];
  }

  await setDoc(doc(db, 'projects', projectId), record, { merge: !isNew });

  // A project that shrank back to inline no longer needs its Storage copy.
  if (!isNew && storageMode === 'inline') {
    deleteObject(ref(storage, `${base}/project.json`)).catch(() => undefined);
  }
  return { projectId, storageMode };
};

const toSummary = (id: string, data: any, userId: string): CloudProjectSummary => ({
  id,
  name: data.name || 'Untitled Plan',
  mode: data.mode || 'floorplan',
  elementsCount: Number(data.elementsCount) || 0,
  thumbnailUrl: data.thumbnailUrl || null,
  storageMode: data.storageMode === 'storage' ? 'storage' : 'inline',
  updatedAt: toDate(data.updatedAt),
  createdAt: toDate(data.createdAt),
  ownerId: data.ownerId,
  role: resolveRole(data, userId),
  linkAccess: data.linkAccess === 'view' ? 'view' : 'none',
  lastEditorName: data.lastEditorName || null,
});

// Projects this user owns plus the ones shared with them (the owner entry wins on overlap).
export const listProjects = async (userId: string): Promise<CloudProjectSummary[]> => {
  const projects = collection(getFirebaseDb(), 'projects');
  const [owned, shared] = await Promise.all([
    getDocs(query(projects, where('ownerId', '==', userId))),
    getDocs(query(projects, where('memberIds', 'array-contains', userId))).catch(() => null),
  ]);
  const byId = new Map<string, CloudProjectSummary>();
  for (const entry of shared?.docs || []) byId.set(entry.id, toSummary(entry.id, entry.data(), userId));
  for (const entry of owned.docs) byId.set(entry.id, toSummary(entry.id, entry.data(), userId));
  return [...byId.values()].sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0));
};

export interface LoadedProject {
  project: Project;
  role: ProjectRole;
  ownerId: string;
  name: string;
  updatedAtMs: number;
}

export const loadProjectWithRole = async (userId: string | null, projectId: string): Promise<LoadedProject> => {
  const snap = await getDoc(doc(getFirebaseDb(), 'projects', projectId));
  if (!snap.exists()) throw new Error('Project not found.');
  const data = snap.data() as any;
  const role = resolveRole(data, userId);
  if (!role) throw new Error('Project not found.');

  let project: Project;
  if (data.storageMode === 'storage') {
    if (role === 'owner') {
      const bytes = await getBytes(ref(getFirebaseStorage(), `${projectPath(data.ownerId, projectId)}/project.json`));
      project = JSON.parse(new TextDecoder().decode(bytes));
    } else {
      // Collaborators read through the download URL; the Storage path sits under the owner's prefix.
      if (!data.dataUrl) throw new Error('This project is missing its saved data.');
      const response = await fetch(data.dataUrl);
      if (!response.ok) throw new Error(`Could not download this project (HTTP ${response.status}).`);
      project = await response.json();
    }
  } else {
    project = JSON.parse(data.data);
  }
  return { project, role, ownerId: data.ownerId, name: data.name || 'Untitled Plan', updatedAtMs: data.updatedAt?.toMillis?.() ?? 0 };
};

export const loadProject = async (userId: string, projectId: string): Promise<Project> =>
  (await loadProjectWithRole(userId, projectId)).project;

export const deleteProject = async (userId: string, projectId: string): Promise<void> => {
  const storage = getFirebaseStorage();
  const base = projectPath(userId, projectId);
  await Promise.all(['project.json', 'thumbnail.jpg'].map(name => deleteObject(ref(storage, `${base}/${name}`)).catch(() => undefined)));
  await deleteDoc(doc(getFirebaseDb(), 'projects', projectId));
};
