import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Project } from '../../types';
import { isFirebaseConfigured } from '../../services/firebase/firebaseConfig';
import { completeGoogleRedirectSignIn, signOut as firebaseSignOut, watchAuthState } from '../../services/firebase/authService';
import { API_AUTH_REQUIRED_EVENT, TOKENS_REQUIRED_EVENT } from '../../services/firebase/apiAuthInterceptor';
import { watchAccountBalance, type BalanceSnapshot } from '../../services/billing/balanceClient';
import AuthModal from '../AuthModal';
import TokensPanel, { type TokenShortfall } from '../TokensPanel';
import AccountPanel from '../AccountPanel';
import ProjectsPanel from '../ProjectsPanel';

// The account layer lives outside App so its modals work on every screen (home, canvas, wizards).
// With Firebase unconfigured it renders nothing extra except the auth modal's notice.

interface ProjectBridge {
  getProject: () => Project | null;
  openProject: (project: Project) => void;
}

interface AccountContextValue {
  enabled: boolean;
  user: User | null;
  authReady: boolean;
  balance: BalanceSnapshot;
  openAuth: () => void;
  openTokens: (shortfall?: TokenShortfall | null) => void;
  openAccount: () => void;
  openProjects: () => void;
  signOut: () => Promise<void>;
  currentProjectId: string | null;
  resetCloudProject: () => void;
  registerProjectBridge: (bridge: ProjectBridge | null) => void;
}

const EMPTY_BALANCE: BalanceSnapshot = { status: 'loading', tokenBalance: null, storageBytesUsed: null, storageQuotaBytes: null };

const AccountContext = createContext<AccountContextValue>({
  enabled: false,
  user: null,
  authReady: false,
  balance: EMPTY_BALANCE,
  openAuth: () => undefined,
  openTokens: () => undefined,
  openAccount: () => undefined,
  openProjects: () => undefined,
  signOut: async () => undefined,
  currentProjectId: null,
  resetCloudProject: () => undefined,
  registerProjectBridge: () => undefined,
});

export const useAccount = () => useContext(AccountContext);

export const AccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [balance, setBalance] = useState<BalanceSnapshot>(EMPTY_BALANCE);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [tokensState, setTokensState] = useState<{ open: boolean; shortfall: TokenShortfall | null }>({ open: false, shortfall: null });
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [bridgeProject, setBridgeProject] = useState<Project | null>(null);
  const bridgeRef = useRef<ProjectBridge | null>(null);
  const pendingCheckoutSuccess = useRef(false);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    completeGoogleRedirectSignIn().catch(err => console.warn('[Auth] Google redirect sign-in failed:', err));
    return watchAuthState(nextUser => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) setCurrentProjectId(null);
      if (nextUser && pendingCheckoutSuccess.current) {
        pendingCheckoutSuccess.current = false;
        setTokensState({ open: true, shortfall: null });
      }
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setBalance(EMPTY_BALANCE);
      return;
    }
    return watchAccountBalance(user.uid, setBalance);
  }, [user]);

  // Returning from Stripe Checkout: open Tokens once, and strip the query so a refresh doesn't reopen it.
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (!checkout) return;
    if (checkout === 'success') pendingCheckoutSuccess.current = true;
    params.delete('checkout');
    params.delete('pack');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const onAuthRequired = () => setIsAuthOpen(true);
    const onTokensRequired = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      setTokensState({ open: true, shortfall: detail });
    };
    window.addEventListener(API_AUTH_REQUIRED_EVENT, onAuthRequired);
    window.addEventListener(TOKENS_REQUIRED_EVENT, onTokensRequired);
    return () => {
      window.removeEventListener(API_AUTH_REQUIRED_EVENT, onAuthRequired);
      window.removeEventListener(TOKENS_REQUIRED_EVENT, onTokensRequired);
    };
  }, []);

  // Esc closes modals in priority order: Auth, then Tokens, then Account (then Projects).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isAuthOpen) setIsAuthOpen(false);
      else if (tokensState.open) setTokensState({ open: false, shortfall: null });
      else if (isAccountOpen) setIsAccountOpen(false);
      else if (isProjectsOpen) setIsProjectsOpen(false);
      else return;
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isAuthOpen, tokensState.open, isAccountOpen, isProjectsOpen]);

  const openProjects = useCallback(() => {
    setBridgeProject(bridgeRef.current?.getProject() || null);
    setIsProjectsOpen(true);
  }, []);

  const resetCloudProject = useCallback(() => setCurrentProjectId(null), []);
  const registerProjectBridge = useCallback((bridge: ProjectBridge | null) => { bridgeRef.current = bridge; }, []);

  const value = useMemo<AccountContextValue>(() => ({
    enabled: isFirebaseConfigured,
    user,
    authReady,
    balance,
    openAuth: () => setIsAuthOpen(true),
    openTokens: (shortfall = null) => setTokensState({ open: true, shortfall }),
    openAccount: () => setIsAccountOpen(true),
    openProjects,
    signOut: async () => {
      await firebaseSignOut();
      setCurrentProjectId(null);
    },
    currentProjectId,
    resetCloudProject,
    registerProjectBridge,
  }), [user, authReady, balance, currentProjectId, openProjects, resetCloudProject, registerProjectBridge]);

  return (
    <AccountContext.Provider value={value}>
      {children}
      {isFirebaseConfigured && (
        <>
          <ProjectsPanel
            isOpen={isProjectsOpen && !!user}
            onClose={() => setIsProjectsOpen(false)}
            uid={user?.uid || null}
            currentProject={bridgeProject}
            currentProjectId={currentProjectId}
            onSaved={projectId => {
              setCurrentProjectId(projectId);
              setBridgeProject(bridgeRef.current?.getProject() || null);
            }}
            onOpenProject={(project, projectId) => {
              bridgeRef.current?.openProject(project);
              setCurrentProjectId(projectId);
            }}
          />
          <AccountPanel
            isOpen={isAccountOpen && !!user}
            onClose={() => setIsAccountOpen(false)}
            user={user}
            onAccountDeleted={() => setCurrentProjectId(null)}
          />
          <TokensPanel
            isOpen={tokensState.open && !!user}
            onClose={() => setTokensState({ open: false, shortfall: null })}
            uid={user?.uid || null}
            email={user?.email || null}
            balance={balance}
            shortfall={tokensState.shortfall}
          />
        </>
      )}
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </AccountContext.Provider>
  );
};
