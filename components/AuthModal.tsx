import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Lock, LogIn, Mail, User, X } from 'lucide-react';
import { isFirebaseConfigured } from '../services/firebase/firebaseConfig';
import {
  getFirebaseAuthErrorMessage,
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '../services/firebase/authService';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignedIn?: () => void;
}

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

const inputClass = 'w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300';
const inputIconClass = 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400';

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSignedIn }) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setIsBusy(false);
      setError(null);
      setNotice(null);
      setPassword('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isSignUp = mode === 'signup';

  const switchMode = () => {
    setMode(isSignUp ? 'signin' : 'signup');
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isFirebaseConfigured) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (isSignUp) await signUpWithEmail(email, password, displayName);
      else await signInWithEmail(email, password);
      onSignedIn?.();
      onClose();
    } catch (err) {
      setError(getFirebaseAuthErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleGoogle = async () => {
    if (!isFirebaseConfigured) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const user = await signInWithGoogle();
      // null = redirect fallback: stay in the loading state while the page navigates away.
      if (!user) return;
      onSignedIn?.();
      onClose();
      setIsBusy(false);
    } catch (err) {
      setError(getFirebaseAuthErrorMessage(err));
      setIsBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError('Enter your email address first, then press "Forgot password?" again.');
      return;
    }
    try {
      await sendPasswordReset(email);
      setNotice('If that address has an account, a reset link is on its way.');
    } catch (err) {
      setError(getFirebaseAuthErrorMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget && !isBusy) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 space-y-6 animate-in fade-in zoom-in-95" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 rounded-xl text-white shadow-lg shadow-slate-300">
              <LogIn size={20} />
            </div>
            <h2 id="auth-modal-title" className="text-lg font-black text-slate-900">{isSignUp ? 'Create Account' : 'Sign In'}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {!isFirebaseConfigured ? (
          <div className="flex items-start gap-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Firebase isn't configured for this deployment, so accounts are switched off. Add the VITE_FIREBASE_* variables to enable sign-in.</span>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={isBusy}
              className="w-full py-3 bg-white border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-100" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {isSignUp && (
                <div className="relative">
                  <User className={inputIconClass} />
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Full name"
                    autoComplete="name"
                    className={inputClass}
                  />
                </div>
              )}
              <div className="relative">
                <Mail className={inputIconClass} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                  required
                  className={inputClass}
                />
              </div>
              <div className="relative">
                <Lock className={inputIconClass} />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  minLength={6}
                  required
                  className={inputClass}
                />
              </div>

              {!isSignUp && (
                <div className="flex justify-end">
                  <button type="button" onClick={handleForgotPassword} className="text-xs font-bold text-slate-500 hover:underline">
                    Forgot password?
                  </button>
                </div>
              )}

              {notice && (
                <div className="text-xs font-medium text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">{notice}</div>
              )}
              {error && (
                <div className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>
              )}

              <button
                type="submit"
                disabled={isBusy}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSignUp ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            <p className="text-center text-xs font-medium text-slate-500">
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <button type="button" onClick={switchMode} className="font-bold text-slate-900 hover:underline">
                {isSignUp ? 'Sign in' : 'Sign up'}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
