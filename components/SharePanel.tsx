import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2, Lock, Mail, Send, Share2, UserMinus, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  createInvite,
  getShareState,
  removeMember,
  revokeInvite,
  setLinkAccess,
  shareKindLabel,
  type ProjectShareState,
  type ShareTarget,
} from '../services/firebase/sharingService';
import { buildInviteMessage, buildShareUrl, canShare, getPublicAppUrl, isLikelyEmail, type MemberRole } from '../services/firebase/shareAccess';
import { usePresencePeers } from './collab/usePresence';
import { describeView } from '../services/firebase/presenceThrottle';

interface SharePanelProps {
  isOpen: boolean;
  onClose: () => void;
  // A floorplan project or a saved render session; both share the same way.
  target: ShareTarget | null;
  user: User | null;
}

const sectionLabel = 'text-[10px] font-bold text-slate-400 uppercase tracking-widest';
const inputClass = 'w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300';
const inputIconClass = 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400';

const describeError = (err: any) => err?.message || String(err);

const SharePanel: React.FC<SharePanelProps> = ({ isOpen, onClose, target, user }) => {
  const [state, setState] = useState<ProjectShareState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('editor');
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState<string | null>(null);
  const peers = usePresencePeers();

  const refresh = useCallback(async () => {
    if (!target) return;
    try {
      setState(await getShareState(target, user?.uid || null));
    } catch (err) {
      console.warn('[Share] Could not load sharing settings:', err);
      setError(describeError(err));
    }
  }, [target?.kind, target?.id, user]);

  useEffect(() => {
    if (!isOpen) {
      setNotice(null);
      setError(null);
      setCopied(false);
      setEmail('');
      return;
    }
    setState(null);
    void refresh();
  }, [isOpen, refresh]);

  if (!isOpen || !target) return null;

  const isOwner = canShare(state?.role ?? null);
  const kindLabel = shareKindLabel(target.kind);
  const shareUrl = state ? buildShareUrl(getPublicAppUrl(window.location.origin), target.id, state.shareToken, target.kind) : '';

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy the link. Select it and copy manually.');
    }
  };

  // Opens the owner's own mail client with the invitation ready to send.
  const inviteMessageFor = (recipient: string, inviteRole: MemberRole = 'editor') => buildInviteMessage({
    inviterName: user?.displayName || user?.email || 'A collaborator',
    recipientEmail: recipient,
    itemName: state?.name || kindLabel,
    kindLabel,
    role: inviteRole,
    url: shareUrl,
  });

  const emailInvite = (recipient: string, inviteRole: MemberRole = 'editor') => {
    window.open(inviteMessageFor(recipient, inviteRole).mailto, '_blank');
  };

  const copyInvite = async (recipient: string, inviteRole: MemberRole = 'editor') => {
    const { body } = inviteMessageFor(recipient, inviteRole);
    try {
      await navigator.clipboard.writeText(body);
      setCopiedInvite(recipient);
      setTimeout(() => setCopiedInvite(null), 1500);
    } catch {
      setError('Could not copy the message. Copy the link above instead.');
    }
  };

  // Asks the server to send the invitation (Firebase Trigger Email extension).
  // Returns false when email isn't set up, so the caller opens a draft instead.
  const sendInviteEmail = async (recipient: string, inviteRole: MemberRole): Promise<boolean> => {
    try {
      const res = await fetch('/api/share/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: target.kind,
          targetId: target.id,
          email: recipient,
          role: inviteRole,
          url: shareUrl,
          itemName: state?.name,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const handleInvite = () => run('invite', async () => {
    if (!isLikelyEmail(email)) throw new Error('Enter a valid email address.');
    if (!user || !state) throw new Error('Sign in first.');
    const recipient = email.trim();
    await createInvite(target, state.name, recipient, role, user);
    setEmail('');
    const sent = await sendInviteEmail(recipient, role);
    if (sent) {
      setNotice(`Invited ${recipient} and emailed them the link. Their access applies at their next sign-in.`);
    } else {
      setNotice(`Invited ${recipient}. Automatic email isn't set up, so your mail app has opened with the invitation ready to send.`);
      emailInvite(recipient, role);
    }
  });

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95" role="dialog" aria-modal="true" aria-labelledby="share-panel-title">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 rounded-xl text-white shadow-lg shadow-slate-300">
              <Share2 size={20} />
            </div>
            <h2 id="share-panel-title" className="text-lg font-black text-slate-900">
            {target.kind === 'session' ? 'Share render session' : 'Share'}
          </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {!state && error ? (
          <div className="p-6 space-y-3">
            <div className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>
            <button onClick={() => { setError(null); void refresh(); }} className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold">Try again</button>
          </div>
        ) : !state ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></div>
        ) : (
          <div className="overflow-y-auto p-6 space-y-6">
            <div className="space-y-2">
              <div className={sectionLabel}>Anyone with the link</div>
              <div className="flex gap-2">
                <button
                  onClick={() => run('link-none', async () => { await setLinkAccess(target, 'none'); })}
                  disabled={!isOwner || !!busy}
                  className={`flex-1 py-2.5 rounded-2xl text-xs font-bold border flex items-center justify-center gap-1.5 disabled:opacity-50 ${state.linkAccess === 'none' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                >
                  <Lock className="w-3.5 h-3.5" /> Restricted
                </button>
                <button
                  onClick={() => run('link-view', async () => { await setLinkAccess(target, 'view'); })}
                  disabled={!isOwner || !!busy}
                  className={`flex-1 py-2.5 rounded-2xl text-xs font-bold border flex items-center justify-center gap-1.5 disabled:opacity-50 ${state.linkAccess === 'view' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                >
                  <Link2 className="w-3.5 h-3.5" /> Anyone can view
                </button>
              </div>
              {state.linkAccess === 'view' && (
                <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                  <span className="flex-1 font-mono text-[11px] text-slate-600 truncate">{shareUrl}</span>
                  <button onClick={handleCopy} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70" aria-label="Copy link">
                    {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              )}
              <p className="text-[10px] font-medium text-slate-400">
                A link only ever allows viewing. To let someone change this {kindLabel}, invite them below.
              </p>
            </div>

            {isOwner && (
              <div className="space-y-2">
                <div className={sectionLabel}>Invite by email</div>
                <div className="relative">
                  <Mail className={inputIconClass} />
                  <input
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleInvite(); }}
                    placeholder="name@example.com"
                    type="email"
                    className={inputClass}
                  />
                </div>
                <div className="flex gap-2">
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value as MemberRole)}
                    className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  >
                    <option value="editor">Can edit</option>
                    <option value="viewer">Can view</option>
                  </select>
                  <button
                    onClick={handleInvite}
                    disabled={!!busy || !email.trim()}
                    className="px-5 py-3 bg-slate-900 text-white rounded-2xl font-bold text-sm hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2"
                  >
                    {busy === 'invite' && <Loader2 className="w-4 h-4 animate-spin" />}
                    Invite
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className={sectionLabel}>People with access</div>
              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-800 truncate">{state.ownerEmail || 'Owner'}</div>
                  <div className="text-[10px] font-medium text-slate-400">Owner</div>
                </div>
              </div>
              {state.members.map(member => (
                <div key={member.uid} className="flex items-center gap-3 py-2 border-t border-slate-100">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-800 truncate">{member.name}</div>
                    <div className="text-[10px] font-medium text-slate-400 truncate">{member.email} · {member.role === 'editor' ? 'Can edit' : 'Can view'}</div>
                  </div>
                  {isOwner && (
                    <button
                      onClick={() => run(`remove-${member.uid}`, async () => { await removeMember(target, member.uid); })}
                      disabled={!!busy}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                      aria-label={`Remove ${member.name}`}
                    >
                      {busy === `remove-${member.uid}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              ))}
              {state.invitedEmails.map(invited => (
                <div key={invited} className="flex items-center gap-3 py-2 border-t border-slate-100">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-500 truncate">{invited}</div>
                    <div className="text-[10px] font-medium text-slate-400">Invited — access starts at their next sign-in</div>
                  </div>
                  {isOwner && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => emailInvite(invited)}
                        title="Open this invitation in your email app"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => copyInvite(invited)}
                        title="Copy the invitation text"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                      >
                        {copiedInvite === invited ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => run(`revoke-${invited}`, async () => { await revokeInvite(target, invited); })}
                        disabled={!!busy}
                        className="text-[10px] font-bold text-slate-500 hover:text-red-600 hover:underline disabled:opacity-50"
                      >
                        {busy === `revoke-${invited}` ? 'Revoking…' : 'Revoke'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {peers.length > 0 && (
              <div className="space-y-2">
                <div className={sectionLabel}>Here right now</div>
                {peers.map(peer => (
                  <div key={peer.key} className="flex items-center gap-2 py-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: peer.color }} />
                    <span className="text-xs font-bold text-slate-700 truncate">{peer.name}</span>
                    <span className="text-[10px] font-medium text-slate-400 truncate">{describeView(peer.view)}</span>
                  </div>
                ))}
              </div>
            )}

            {notice && <div className="text-xs font-medium text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">{notice}</div>}
            {error && <div className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>}
            {!isOwner && (
              <div className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                Only the owner can change who has access to this {kindLabel}.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SharePanel;
