// Pure sharing logic: who may do what with a project, share URLs and save-conflict detection.
// No Firebase imports, so scripts/testSharing.mjs can exercise it directly.

export type ProjectRole = 'owner' | 'editor' | 'viewer' | null;
export type LinkAccess = 'none' | 'view';
export type MemberRole = 'viewer' | 'editor';

export interface ShareableProjectData {
  ownerId?: string;
  members?: Record<string, MemberRole> | null;
  memberIds?: string[] | null;
  linkAccess?: LinkAccess | null;
  [key: string]: unknown;
}

// A link only ever grants viewing; editing requires an explicit invite.
export const resolveRole = (data: ShareableProjectData | null | undefined, uid: string | null | undefined): ProjectRole => {
  if (!data) return null;
  if (uid && data.ownerId === uid) return 'owner';
  const memberRole = uid ? data.members?.[uid] : undefined;
  if (memberRole === 'editor' || memberRole === 'viewer') return memberRole;
  if (data.linkAccess === 'view') return 'viewer';
  return null;
};

export const canEdit = (role: ProjectRole): boolean => role === 'owner' || role === 'editor';
export const canShare = (role: ProjectRole): boolean => role === 'owner';
export const canDelete = (role: ProjectRole): boolean => role === 'owner';

export const describeRole = (role: ProjectRole): string =>
  role === 'owner' ? 'Owner' : role === 'editor' ? 'Can edit' : role === 'viewer' ? 'Can view' : 'No access';

export const normalizeEmail = (email: string): string => String(email || '').trim().toLowerCase();

export const isLikelyEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email));

// One invite per (email, project). Emails cannot contain '/', so this is a legal document id.
export const inviteId = (email: string, projectId: string): string => `${normalizeEmail(email)}__${projectId}`;

export const buildShareUrl = (origin: string, projectId: string, token?: string | null): string => {
  const base = String(origin || '').replace(/\/+$/, '');
  return `${base}/?p=${encodeURIComponent(projectId)}${token ? `&s=${encodeURIComponent(token)}` : ''}`;
};

export const parseShareParams = (search: string): { projectId: string; token: string | null } | null => {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const projectId = params.get('p');
  if (!projectId) return null;
  return { projectId, token: params.get('s') };
};

export const createShareToken = (): string =>
  `s_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

// Last-write-wins, but warn first: true when the stored copy is newer than the one being edited.
export const detectConflict = (loadedAtMs: number | null | undefined, remoteMs: number | null | undefined): boolean => {
  if (loadedAtMs == null || remoteMs == null) return false;
  return remoteMs > loadedAtMs;
};

// Adds one member without disturbing the others (used when an invite is claimed).
export const nextMembersAfterInviteClaim = (
  data: ShareableProjectData | null | undefined,
  uid: string,
  role: MemberRole,
): { members: Record<string, MemberRole>; memberIds: string[] } => {
  const members = { ...(data?.members || {}) } as Record<string, MemberRole>;
  members[uid] = role;
  const memberIds = [...new Set([...(data?.memberIds || []), uid])];
  return { members, memberIds };
};

export const nextMembersAfterRemoval = (
  data: ShareableProjectData | null | undefined,
  uid: string,
): { members: Record<string, MemberRole>; memberIds: string[] } => {
  const members = { ...(data?.members || {}) } as Record<string, MemberRole>;
  delete members[uid];
  return { members, memberIds: (data?.memberIds || []).filter(id => id !== uid) };
};
