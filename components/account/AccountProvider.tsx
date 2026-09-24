import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Project } from '../../types';
import { getFirebaseAuth, isFirebaseConfigured } from '../../services/firebase/firebaseConfig';
import { completeGoogleRedirectSignIn, signOut as firebaseSignOut, watchAuthState } from '../../services/firebase/authService';
import { API_AUTH_REQUIRED_EVENT, TOKENS_REQUIRED_EVENT } from '../../services/firebase/apiAuthInterceptor';
import { watchAccountBalance, type BalanceSnapshot } from '../../services/billing/balanceClient';
import AuthModal from '../AuthModal';
import SharePanel from '../SharePanel';
import { loadProjectWithRole } from '../../services/firebase/projectsService';
import { claimInvites } from '../../services/firebase/sharingService';
import { canEdit, parseShareParams, type ProjectRole } from '../../services/firebase/shareAccess';
import TokensPanel, { type TokenShortfall } from '../TokensPanel';
import AccountPanel from '../AccountPanel';
import ProjectsPanel from '../ProjectsPanel';
import SharedArrivalDialog, { type SharedArrival } from '../SharedArrivalDialog';

// Reads the signed-in user outside React state (auth may resolve before the first render).
const getAuthUserSync = (): User | null => {
  try {
    return isFirebaseConfigured ? getFirebaseAuth().currentUser : null;
  } catch {
    return null;
  }
};

// The account layer lives outside App so its modals work on every screen (home, canvas, wizards).
// With Firebase unconfigured it renders nothing extra except the auth modal's notice.

interface ProjectBridge {
  getProject: () => Project | null;
  openProject: (project: Project) => void;
  renameProject?: (name: string) => void;
}

interface AccountContextValue {
  enabled: boolean;
  user: User | null;
  authReady: boolean;
  balance: BalanceSnapshot;
  // Sharing
  currentProjectRole: ProjectRole;
  isReadOnlyProject: boolean;
  openShare: (target?: { kind: 'project' | 'session'; id: string } | null) => void;
  // A render session someone shared by link, waiting for the render canvas to open it.
  pendingSharedSessionId: string | null;
  consumePendingSharedSession: () => void;
  // Shows the "… shared this with you" welcome after a shared link opens something.
  announceSharedArrival: (arrival: SharedArrival) => void;
  openAuth: () => void;
  openTokens: (shortfall?: TokenShortfall | null) => void;
  openAccount: () => void;
  openProjects: () => void;
  signOut: () => Promise<void>;
  currentProjectId: string | null;
  currentProjectLoadedAtMs: number | null;
  setCloudProject: (projectId: string, role?: ProjectRole, updatedAtMs?: number | null) => void;
  resetCloudProject: () => void;
  registerProjectBridge: (bridge: ProjectBridge | null) => void;
}

const EMPTY_BALANCE: BalanceSnapshot = { status: 'loading', tokenBalance: null, storageBytesUsed: null, storageQuotaBytes: null };

const AccountContext = createContext<AccountContextValue>({
  enabled: false,
  user: null,
  authReady: false,
  balance: EMPTY_BALANCE,
  currentProjectRole: null,
  isReadOnlyProject: false,
  openShare: () => undefined,
  pendingSharedSessionId: null,
  consumePendingSharedSession: () => undefined,
  announceSharedArrival: () => undefined,
  openAuth: () => undefined,
  openTokens: () => undefined,
  openAccount: () => undefined,
  openProjects: () => undefined,
  signOut: async () => undefined,
  currentProjectId: null,
  currentProjectLoadedAtMs: null,
  setCloudProject: () => undefined,
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
  const [currentProjectRole, setCurrentProjectRole] = useState<ProjectRole>(null);
  const [currentProjectLoadedAtMs, setCurrentProjectLoadedAtMs] = useState<number | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ kind: 'project' | 'session'; id: string } | null>(null);
  const [pendingSharedSessionId, setPendingSharedSessionId] = useState<string | null>(null);
  const [sharedArrival, setSharedArrival] = useState<SharedArrival | null>(null);
  const pendingShareRef = useRef<{ projectId: string; token: string | null; kind: 'project' | 'session' } | null>(null);
  const [bridgeProject, setBridgeProject] = useState<Project | null>(null);
  const bridgeRef = useRef<ProjectBridge | null>(null);
  const pendingCheckoutSuccess = useRef(false);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    completeGoogleRedirectSignIn().catch(err => console.warn('[Auth] Google redirect sign-in failed:', err));
    return watchAuthState(nextUser => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setCurrentProjectId(null);
        setCurrentProjectRole(null);
        setCurrentProjectLoadedAtMs(null);
      }
      if (nextUser) {
        // Invitations are addressed by email and become real access at the invitee's next sign-in.
        void claimInvites(nextUser)
          .catch(err => console.warn('[Sharing] Invite claim failed:', err))
          .then(() => {
            const pending = pendingShareRef.current;
            if (!pending) return;
            pendingShareRef.current = null;
            if (pending.kind === 'session') setPendingSharedSessionId(pending.projectId);
            else void openSharedProjectRef.current?.(pending.projectId);
          });
      }
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

  // Someone opened a share link: remember it, strip the query, then open it once signed in.
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const share = parseShareParams(window.location.search);
    if (!share) return;
    pendingShareRef.current = share;
    const params = new URLSearchParams(window.location.search);
    params.delete('p');
    params.delete('rs');
    params.delete('s');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    if (!getAuthUserSync()) setIsAuthOpen(true);
  }, []);

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
      else if (isShareOpen) setIsShareOpen(false);
      else if (isProjectsOpen) setIsProjectsOpen(false);
      else return;
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isAuthOpen, tokensState.open, isAccountOpen, isShareOpen, isProjectsOpen]);

  // Opens a project the user reached through a share link (or an invite they just claimed).
  const openSharedProject = useCallback(async (projectId: string) => {
    try {
      const loaded = await loadProjectWithRole(getAuthUserSync()?.uid || null, projectId);
      bridgeRef.current?.openProject(loaded.project);
      setCurrentProjectId(projectId);
      setCurrentProjectRole(loaded.role);
      setCurrentProjectLoadedAtMs(loaded.updatedAtMs);
      if (loaded.role !== 'owner') {
        setSharedArrival({ kind: 'project', name: loaded.name, ownerEmail: loaded.ownerEmail, role: loaded.role });
      }
    } catch (error) {
      console.warn('[Sharing] Could not open the shared project:', error);
      window.alert('That shared plan could not be opened. Ask the owner to check that the link is still switched on.');
    }
  }, []);
  const openSharedProjectRef = useRef(openSharedProject);
  openSharedProjectRef.current = openSharedProject;

  const openProjects = useCallback(() => {
    setBridgeProject(bridgeRef.current?.getProject() || null);
    setIsProjectsOpen(true);
  }, []);

  const resetCloudProject = useCallback(() => {
    setCurrentProjectId(null);
    setCurrentProjectRole(null);
    setCurrentProjectLoadedAtMs(null);
  }, []);
  const setCloudProject = useCallback((projectId: string, role: ProjectRole = 'owner', updatedAtMs: number | null = null) => {
    setCurrentProjectId(projectId);
    setCurrentProjectRole(role);
    setCurrentProjectLoadedAtMs(updatedAtMs);
  }, []);
  const registerProjectBridge = useCallback((bridge: ProjectBridge | null) => { bridgeRef.current = bridge; }, []);

  const value = useMemo<AccountContextValue>(() => ({
    enabled: isFirebaseConfigured,
    user,
    authReady,
    balance,
    currentProjectRole,
    isReadOnlyProject: !!currentProjectId && currentProjectRole != null && !canEdit(currentProjectRole),
    openShare: (target = null) => {
      // Guard against being handed a click event (onClick={openShare}): only a real target counts.
      const isTarget = !!target && (target.kind === 'project' || target.kind === 'session') && typeof target.id === 'string' && !!target.id;
      setShareTarget(isTarget ? target : (currentProjectId ? { kind: 'project', id: currentProjectId } : null));
      setIsShareOpen(true);
    },
    pendingSharedSessionId,
    consumePendingSharedSession: () => setPendingSharedSessionId(null),
    announceSharedArrival: (arrival: SharedArrival) => setSharedArrival(arrival),
    openAuth: () => setIsAuthOpen(true),
    openTokens: (shortfall = null) => setTokensState({ open: true, shortfall }),
    openAccount: () => setIsAccountOpen(true),
    openProjects,
    signOut: async () => {
      await firebaseSignOut();
      setCurrentProjectId(null);
    },
    currentProjectId,
    currentProjectLoadedAtMs,
    setCloudProject,
    resetCloudProject,
    registerProjectBridge,
  }), [user, authReady, balance, currentProjectId, currentProjectRole, currentProjectLoadedAtMs, pendingSharedSessionId, openProjects, setCloudProject, resetCloudProject, registerProjectBridge]);

  return (
    <AccountContext.Provider value={value}>
      {children}
      {isFirebaseConfigured && (
        <>
          <ProjectsPanel
            isOpen={isProjectsOpen && !!user}
            onClose={() => setIsProjectsOpen(false)}
            uid={user?.uid || null}
            userName={user?.displayName || user?.email || null}
            userEmail={user?.email || null}
            currentProject={bridgeProject}
            currentProjectId={currentProjectId}
            currentProjectRole={currentProjectRole}
            currentProjectLoadedAtMs={currentProjectLoadedAtMs}
            onSaved={(projectId, updatedAtMs) => {
              setCurrentProjectId(projectId);
              setCurrentProjectRole(role => role || 'owner');
              setCurrentProjectLoadedAtMs(updatedAtMs ?? Date.now());
              setBridgeProject(bridgeRef.current?.getProject() || null);
            }}
            onRenameProject={name => {
              bridgeRef.current?.renameProject?.(name);
              setBridgeProject(bridgeRef.current?.getProject() || null);
            }}
            onOpenProject={(project, projectId, role, updatedAtMs) => {
              bridgeRef.current?.openProject(project);
              setCurrentProjectId(projectId);
              setCurrentProjectRole(role ?? 'owner');
              setCurrentProjectLoadedAtMs(updatedAtMs ?? null);
            }}
          />
          <SharePanel
            isOpen={isShareOpen && !!user && !!(shareTarget || currentProjectId)}
            onClose={() => setIsShareOpen(false)}
            target={shareTarget || (currentProjectId ? { kind: 'project', id: currentProjectId } : null)}
            user={user}
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
      <SharedArrivalDialog arrival={sharedArrival} onClose={() => setSharedArrival(null)} />
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </AccountContext.Provider>
  );
};
