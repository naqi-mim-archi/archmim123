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

export type ShareTargetKind = 'project' | 'session';

// Links in invitations must work for the recipient, so they use the public site address
// (VITE_PUBLIC_APP_URL) rather than wherever the sender happens to be, e.g. localhost.
export const getPublicAppUrl = (fallbackOrigin: string): string => {
  const configured = String(((import.meta as any).env || {}).VITE_PUBLIC_APP_URL || '').trim();
  return (configured || fallbackOrigin).replace(/\/+$/, '');
};

// ?p= a plan, ?rs= a render session. Both take an optional &s= token.
export const buildShareUrl = (origin: string, id: string, token?: string | null, kind: ShareTargetKind = 'project'): string => {
  const base = String(origin || '').replace(/\/+$/, '');
  const key = kind === 'session' ? 'rs' : 'p';
  return `${base}/?${key}=${encodeURIComponent(id)}${token ? `&s=${encodeURIComponent(token)}` : ''}`;
};

export const parseShareParams = (search: string): { projectId: string; token: string | null; kind: ShareTargetKind } | null => {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const sessionId = params.get('rs');
  if (sessionId) return { projectId: sessionId, token: params.get('s'), kind: 'session' };
  const projectId = params.get('p');
  if (!projectId) return null;
  return { projectId, token: params.get('s'), kind: 'project' };
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

// No email is sent from the app itself; this composes the message the owner sends from
// their own mail client, so the invite arrives from a real address the recipient knows.
export const buildInviteMessage = (input: {
  inviterName: string;
  recipientEmail: string;
  itemName: string;
  kindLabel: string;
  role: MemberRole;
  url: string;
}): { subject: string; body: string; mailto: string } => {
  const action = input.role === 'editor' ? 'edit' : 'view';
  const subject = `${input.inviterName} shared the ${input.kindLabel} "${input.itemName}" with you`;
  const body = [
    `${input.inviterName} has invited you to ${action} the ${input.kindLabel} "${input.itemName}" in ArchAI.`,
    '',
    `Open it here: ${input.url}`,
    '',
    `Sign in with this email address (${input.recipientEmail}) and your access is applied automatically.`,
  ].join(String.fromCharCode(10));
  return {
    subject,
    body,
    mailto: `mailto:${encodeURIComponent(input.recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  };
};
