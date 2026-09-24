import { getAdminDatabase, getAdminFirestore, getRealtimeDbUrl, hasAdminCredentials } from '../firebase/adminApp';
import { resolveRole } from '../firebase/shareAccess';
import type { VerifiedIdToken } from '../firebase/verifyIdToken';

// Sends share invitations, server-side only: the route first checks that the caller really
// owns the plan or session, so nobody can use it to send mail from your domain.
//
// Preferred path is the Resend API (RESEND_API_KEY). If that isn't configured it falls back to
// queueing in the `mail` collection for the Firebase "Trigger Email" extension — note that
// extension is being retired in March 2027, so the API path is the one to keep.

export const MAIL_COLLECTION = process.env.INVITE_MAIL_COLLECTION || 'mail';
export const DEFAULT_FROM = process.env.INVITE_FROM_EMAIL || 'ArchAI <no-reply@auto.archi>';

const sendWithResend = async (to: string, message: { subject: string; text: string; html: string }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false as const, reason: 'no-api-key' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: DEFAULT_FROM, to: [to], subject: message.subject, html: message.html, text: message.text }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend rejected the invitation (HTTP ${res.status}): ${detail.slice(0, 300)}`);
  }
  const body: any = await res.json().catch(() => ({}));
  return { sent: true as const, id: body?.id || null };
};

interface ShareApiRequest {
  method?: string;
  url?: string;
  body?: any;
  user: VerifiedIdToken | null;
}

interface ShareApiResponse {
  status(code: number): ShareApiResponse;
  json(payload: any): void;
}

const COLLECTIONS: Record<string, string> = { project: 'projects', session: 'renderSessions' };

const escapeHtml = (value: string) =>
  String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));

export const buildInviteEmail = (input: {
  inviterName: string;
  itemName: string;
  kindLabel: string;
  role: 'viewer' | 'editor';
  url: string;
  recipientEmail: string;
}) => {
  const action = input.role === 'editor' ? 'edit' : 'view';
  const subject = `${input.inviterName} shared the ${input.kindLabel} "${input.itemName}" with you`;
  const lines = [
    `${input.inviterName} has invited you to ${action} the ${input.kindLabel} "${input.itemName}" in ArchAI.`,
    '',
    `Open it here: ${input.url}`,
    '',
    `Sign in with this email address (${input.recipientEmail}) and your access is applied automatically.`,
  ];
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#0f172a;line-height:1.6">
      <p>${escapeHtml(input.inviterName)} has invited you to <strong>${action}</strong> the ${escapeHtml(input.kindLabel)}
        &ldquo;${escapeHtml(input.itemName)}&rdquo; in ArchAI.</p>
      <p><a href="${escapeHtml(input.url)}"
            style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700">
        Open in ArchAI</a></p>
      <p style="color:#475569;font-size:13px">Sign in with this email address (${escapeHtml(input.recipientEmail)})
        and your access is applied automatically.</p>
    </div>`;
  return { subject, text: lines.join('\n'), html };
};

// Live co-editing: the Realtime Database rules can't read Firestore, so the server looks up the
// caller's real role on the plan and records it under liveAccess/{projectId}/{uid}. Only owners and
// editors may write the live copy; viewers may only read it.
const grantLiveAccess = async (request: ShareApiRequest, response: ShareApiResponse) => {
  const user = request.user;
  if (!user) {
    response.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  if (!hasAdminCredentials() || !getRealtimeDbUrl()) {
    response.status(503).json({ error: 'Live editing is not configured on the server.' });
    return;
  }
  const targetId = String(request.body?.targetId || request.body?.projectId || '');
  const collection = COLLECTIONS[request.body?.kind === 'session' ? 'session' : 'project'];
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(targetId)) {
    response.status(400).json({ error: 'targetId is required.' });
    return;
  }
  try {
    const snap = await getAdminFirestore().collection(collection).doc(targetId).get();
    const role = snap.exists ? resolveRole(snap.data() as any, user.uid) : null;
    const accessRef = getAdminDatabase().ref(`liveAccess/${targetId}/${user.uid}`);
    if (!role) {
      await accessRef.remove();
      response.status(404).json({ error: 'Not Found' });
      return;
    }
    await accessRef.set(role);
    response.status(200).json({ role });
  } catch (error: any) {
    console.error('[Share] Live access could not be granted:', error);
    response.status(502).json({ error: error?.message || 'Live access could not be granted.' });
  }
};

export const routeShareApiRequest = async (request: ShareApiRequest, response: ShareApiResponse): Promise<boolean> => {
  const path = String(request.url || '').split(/[?#]/)[0];
  if (!path.startsWith('/api/share/')) return false;

  if (path === '/api/share/live-access' && String(request.method || 'GET').toUpperCase() === 'POST') {
    await grantLiveAccess(request, response);
    return true;
  }

  if (path !== '/api/share/invite' || String(request.method || 'GET').toUpperCase() !== 'POST') {
    response.status(404).json({ error: 'Not Found' });
    return true;
  }

  const user = request.user;
  if (!user) {
    response.status(401).json({ error: 'Sign in to continue.' });
    return true;
  }
  if (!hasAdminCredentials()) {
    response.status(503).json({ error: 'Invitation email is not configured on the server.' });
    return true;
  }

  const { kind, targetId, email, role, url, itemName } = request.body || {};
  const collection = COLLECTIONS[kind === 'session' ? 'session' : 'project'];
  const recipient = String(email || '').trim().toLowerCase();
  if (!recipient || !targetId || !url) {
    response.status(400).json({ error: 'kind, targetId, email and url are required.' });
    return true;
  }

  try {
    const db = getAdminFirestore();
    // Only the owner of the plan or session may send an invitation for it.
    const target = await db.collection(collection).doc(String(targetId)).get();
    if (!target.exists || target.data()?.ownerId !== user.uid) {
      response.status(404).json({ error: 'Not Found' });
      return true;
    }

    const message = buildInviteEmail({
      inviterName: user.email || 'A collaborator',
      itemName: String(itemName || target.data()?.name || 'a project'),
      kindLabel: kind === 'session' ? 'render session' : 'plan',
      role: role === 'viewer' ? 'viewer' : 'editor',
      url: String(url),
      recipientEmail: recipient,
    });

    const viaApi = await sendWithResend(recipient, message);
    if (viaApi.sent) {
      response.status(200).json({ sent: true, via: 'resend', id: viaApi.id });
      return true;
    }

    // Fallback: queue for the Firebase Trigger Email extension, if that is what's installed.
    await db.collection(MAIL_COLLECTION).add({
      to: [recipient],
      message,
      archai: { kind, targetId, invitedBy: user.uid, createdAt: new Date().toISOString() },
    });
    response.status(200).json({ sent: true, via: 'extension' });
  } catch (error: any) {
    console.error('[Share] Invitation email could not be queued:', error);
    response.status(502).json({ error: error?.message || 'The invitation email could not be queued.' });
  }
  return true;
};
