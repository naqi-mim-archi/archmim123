import React, { useEffect, useState } from 'react';
import { Check, Download, KeyRound, Loader2, ShieldAlert, ShieldCheck, User as UserIcon, UserCircle, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  getFirebaseAuthErrorMessage,
  resendEmailVerification,
  sendPasswordReset,
  updateDisplayName,
} from '../services/firebase/authService';
import { deleteAccount, downloadAccountExport, reauthenticate, usesPasswordSignIn } from '../services/firebase/accountService';

interface AccountPanelProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  planName?: string;
  onAccountDeleted?: () => void;
}

const CONFIRM_PHRASE = 'delete my account';
const sectionLabel = 'text-[10px] font-bold text-slate-400 uppercase tracking-widest';
const inputClass = 'w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300';
const inputIconClass = 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400';
const secondaryButton = 'w-full py-3 bg-white border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-2';

const AccountPanel: React.FC<AccountPanelProps> = ({ isOpen, onClose, user, planName, onAccountDeleted }) => {
  const [name, setName] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [needsReauth, setNeedsReauth] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(user?.displayName || '');
    } else {
      setNotice(null);
      setError(null);
      setIsDeleteOpen(false);
      setConfirmText('');
      setNeedsReauth(false);
      setReauthPassword('');
      setBusy(null);
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const isPasswordAccount = usesPasswordSignIn(user);
  const nameUnchanged = name.trim() === (user.displayName || '').trim();

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err: any) {
      if (err?.code === 'auth/requires-recent-login') {
        setNeedsReauth(true);
        setError(getFirebaseAuthErrorMessage(err));
      } else {
        setError(getFirebaseAuthErrorMessage(err));
      }
    } finally {
      setBusy(null);
    }
  };

  const handleSaveName = () => run('name', async () => {
    await updateDisplayName(name);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  });

  const handleResend = () => run('resend', async () => {
    await resendEmailVerification();
    setNotice('Verification email sent. Check your inbox.');
  });

  const handleChangePassword = () => run('password', async () => {
    await sendPasswordReset(user.email || '');
    setNotice(`A password reset link is on its way to ${user.email}.`);
  });

  const handleExport = () => run('export', async () => {
    const count = await downloadAccountExport();
    setNotice(`Exported ${count} project${count === 1 ? '' : 's'}.`);
  });

  const handleReauth = () => run('reauth', async () => {
    await reauthenticate(isPasswordAccount ? reauthPassword : undefined);
    setNeedsReauth(false);
    setReauthPassword('');
    setNotice('Confirmed. Press Delete Account again to finish.');
  });

  const handleDelete = () => run('delete', async () => {
    await deleteAccount(message => setNotice(message));
    onAccountDeleted?.();
    onClose();
  });

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95" role="dialog" aria-modal="true" aria-labelledby="account-panel-title">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 rounded-xl text-white shadow-lg shadow-slate-300">
              <UserCircle size={20} />
            </div>
            <h2 id="account-panel-title" className="text-lg font-black text-slate-900">Account</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          <div className="space-y-2">
            <div className="text-sm font-bold text-slate-900 break-all">{user.email}</div>
            {user.emailVerified ? (
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                <ShieldCheck className="w-4 h-4" /> Email verified
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600">
                <ShieldAlert className="w-4 h-4" /> Email not verified
                <button onClick={handleResend} disabled={busy === 'resend'} className="ml-1 text-slate-500 hover:underline disabled:opacity-50">Resend</button>
              </div>
            )}
            {planName && (
              <div className="text-xs font-medium text-slate-600">
                <span className={sectionLabel}>Plan</span> · {planName}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className={sectionLabel}>Display name</div>
            <div className="relative">
              <UserIcon className={inputIconClass} />
              <input value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="Your name" className={inputClass} />
            </div>
            <button onClick={handleSaveName} disabled={nameUnchanged || busy === 'name'} className={secondaryButton}>
              {busy === 'name' ? <Loader2 className="w-4 h-4 animate-spin" /> : savedFlash ? <Check className="w-4 h-4" /> : null}
              {savedFlash ? 'Saved' : 'Save name'}
            </button>
          </div>

          <div className="space-y-2">
            <div className={sectionLabel}>Your data</div>
            {isPasswordAccount && (
              <button onClick={handleChangePassword} disabled={!!busy} className={secondaryButton}>
                {busy === 'password' ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                Change password
              </button>
            )}
            <button onClick={handleExport} disabled={!!busy} className={secondaryButton}>
              {busy === 'export' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export my data
            </button>
          </div>

          {notice && <div className="text-xs font-medium text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">{notice}</div>}
          {error && <div className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>}

          <div className="pt-6 border-t border-slate-100 space-y-3">
            {!isDeleteOpen ? (
              <button onClick={() => setIsDeleteOpen(true)} className="w-full py-3 bg-white border border-red-100 rounded-2xl font-bold text-sm text-red-600 hover:bg-red-50">
                Delete account
              </button>
            ) : (
              <>
                <p className="text-xs font-medium text-slate-600">
                  This permanently deletes your account and every saved project. It cannot be undone. Type <span className="font-bold text-slate-900">{CONFIRM_PHRASE}</span> to confirm.
                </p>
                <input
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder={CONFIRM_PHRASE}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                />
                {needsReauth && (
                  isPasswordAccount ? (
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={reauthPassword}
                        onChange={e => setReauthPassword(e.target.value)}
                        placeholder="Current password"
                        className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                      />
                      <button onClick={handleReauth} disabled={!reauthPassword || busy === 'reauth'} className="px-4 py-3 bg-white border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                        {busy === 'reauth' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
                      </button>
                    </div>
                  ) : (
                    <button onClick={handleReauth} disabled={busy === 'reauth'} className={secondaryButton}>
                      {busy === 'reauth' && <Loader2 className="w-4 h-4 animate-spin" />}
                      Confirm with Google
                    </button>
                  )
                )}
                <div className="flex gap-2">
                  <button onClick={() => { setIsDeleteOpen(false); setConfirmText(''); setNeedsReauth(false); }} disabled={busy === 'delete'} className="flex-1 py-3 bg-white border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={confirmText.trim().toLowerCase() !== CONFIRM_PHRASE || !!busy}
                    className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {busy === 'delete' && <Loader2 className="w-4 h-4 animate-spin" />}
                    Delete Account
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountPanel;
