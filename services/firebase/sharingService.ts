import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { getFirebaseDb } from './firebaseConfig';
import {
  createShareToken,
  inviteId,
  normalizeEmail,
  nextMembersAfterInviteClaim,
  nextMembersAfterRemoval,
  resolveRole,
  type LinkAccess,
  type MemberRole,
  type ProjectRole,
} from './shareAccess';

// Firestore side of sharing, for both floorplan projects and saved render sessions.
// A link grants viewing only; editing comes from an invite, which the invitee claims
// automatically the next time they sign in (no email is sent from here).

export type ShareKind = 'project' | 'session';

export interface ShareTarget {
  kind: ShareKind;
  id: string;
}

const COLLECTIONS: Record<ShareKind, string> = { project: 'projects', session: 'renderSessions' };

export const shareKindLabel = (kind: ShareKind) => (kind === 'session' ? 'render session' : 'plan');

export interface ProjectMemberRow {
  uid: string;
  name: string;
  email: string;
  role: MemberRole;
}

export interface ProjectShareState {
  target: ShareTarget;
  name: string;
  ownerId: string;
  ownerEmail: string | null;
  linkAccess: LinkAccess;
  shareToken: string | null;
  members: ProjectMemberRow[];
  invitedEmails: string[];
  role: ProjectRole;
}

const targetRef = (target: ShareTarget) => doc(getFirebaseDb(), COLLECTIONS[target.kind], target.id);

export const getShareState = async (target: ShareTarget, uid: string | null): Promise<ProjectShareState> => {
  const snap = await getDoc(targetRef(target));
  if (!snap.exists()) throw new Error(`This ${shareKindLabel(target.kind)} could not be found.`);
  const data = snap.data() as any;
  const members: ProjectMemberRow[] = Object.entries((data.members || {}) as Record<string, MemberRole>).map(([memberUid, role]) => ({
    uid: memberUid,
    role,
    name: data.memberProfiles?.[memberUid]?.name || 'Collaborator',
    email: data.memberProfiles?.[memberUid]?.email || '',
  }));
  return {
    target,
    name: data.name || (target.kind === 'session' ? 'Render session' : 'Untitled Plan'),
    ownerId: data.ownerId,
    ownerEmail: data.ownerEmail || null,
    linkAccess: data.linkAccess === 'view' ? 'view' : 'none',
    shareToken: data.shareToken || null,
    members,
    invitedEmails: Array.isArray(data.invitedEmails) ? data.invitedEmails : [],
    role: resolveRole(data, uid),
  };
};

export const setLinkAccess = async (target: ShareTarget, linkAccess: LinkAccess): Promise<string | null> => {
  const snap = await getDoc(targetRef(target));
  const existingToken = snap.data()?.shareToken || null;
  const shareToken = linkAccess === 'view' ? (existingToken || createShareToken()) : existingToken;
  await updateDoc(targetRef(target), { linkAccess, shareToken: shareToken || null, updatedAt: serverTimestamp() });
  return linkAccess === 'view' ? shareToken : null;
};

export const createInvite = async (
  target: ShareTarget,
  name: string,
  email: string,
  role: MemberRole,
  invitedBy: User,
): Promise<void> => {
  const normalized = normalizeEmail(email);
  const db = getFirebaseDb();
  await setDoc(doc(db, 'invites', inviteId(normalized, target.id)), {
    email: normalized,
    kind: target.kind,
    projectId: target.id, // target id, whichever collection it lives in
    projectName: name,
    role,
    invitedBy: invitedBy.uid,
    invitedByName: invitedBy.displayName || invitedBy.email || 'A collaborator',
    createdAt: serverTimestamp(),
  });
  const snap = await getDoc(targetRef(target));
  const invitedEmails = [...new Set([...(snap.data()?.invitedEmails || []), normalized])];
  await updateDoc(targetRef(target), { invitedEmails, updatedAt: serverTimestamp() });
};

export const revokeInvite = async (target: ShareTarget, email: string): Promise<void> => {
  const normalized = normalizeEmail(email);
  await deleteDoc(doc(getFirebaseDb(), 'invites', inviteId(normalized, target.id))).catch(() => undefined);
  const snap = await getDoc(targetRef(target));
  const invitedEmails = (snap.data()?.invitedEmails || []).filter((entry: string) => entry !== normalized);
  await updateDoc(targetRef(target), { invitedEmails, updatedAt: serverTimestamp() });
};

export const removeMember = async (target: ShareTarget, uid: string): Promise<void> => {
  const snap = await getDoc(targetRef(target));
  const data = snap.data() as any;
  const { members, memberIds } = nextMembersAfterRemoval(data, uid);
  const memberProfiles = { ...(data?.memberProfiles || {}) };
  delete memberProfiles[uid];
  await updateDoc(targetRef(target), { members, memberIds, memberProfiles, updatedAt: serverTimestamp() });
};

// Called on every sign-in: turns invites addressed to this email into real membership,
// for both plans and render sessions.
export const claimInvites = async (user: User): Promise<number> => {
  const email = normalizeEmail(user.email || '');
  if (!email) return 0;
  const db = getFirebaseDb();
  let claimed = 0;
  const invites = await getDocs(query(collection(db, 'invites'), where('email', '==', email)));
  for (const invite of invites.docs) {
    const raw = invite.data() as { projectId: string; role: MemberRole; kind?: ShareKind };
    const target: ShareTarget = { kind: raw.kind === 'session' ? 'session' : 'project', id: raw.projectId };
    try {
      const snap = await getDoc(targetRef(target));
      if (!snap.exists()) {
        await deleteDoc(invite.ref).catch(() => undefined);
        continue;
      }
      const data = snap.data() as any;
      const { members, memberIds } = nextMembersAfterInviteClaim(data, user.uid, raw.role);
      const memberProfiles = {
        ...(data.memberProfiles || {}),
        [user.uid]: { name: user.displayName || email, email },
      };
      await updateDoc(targetRef(target), {
        members,
        memberIds,
        memberProfiles,
        invitedEmails: (data.invitedEmails || []).filter((entry: string) => entry !== email),
        updatedAt: serverTimestamp(),
      });
      await deleteDoc(invite.ref).catch(() => undefined);
      claimed += 1;
    } catch (error) {
      console.warn('[Sharing] Could not claim an invite:', error);
    }
  }
  return claimed;
};

export const listInvitesForEmail = async (email: string) => {
  const invites = await getDocs(query(collection(getFirebaseDb(), 'invites'), where('email', '==', normalizeEmail(email))));
  return invites.docs.map(entry => ({ id: entry.id, ...(entry.data() as any) }));
};
