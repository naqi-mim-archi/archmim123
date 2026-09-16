import React, { useEffect, useRef, useState } from 'react';
import { Cloud, Coins, LogIn, LogOut, Settings, UserCircle } from 'lucide-react';
import { useAccount } from './AccountProvider';
import { formatTokens } from '../../services/billing/pricing';

const menuItemClass = 'w-full rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100/90 hover:text-slate-900 flex items-center gap-2.5 cursor-pointer';

// Top bar, right side: token chip + account menu. Renders nothing when Firebase isn't configured.
export const AccountHeaderControls: React.FC = () => {
  const { enabled, user, authReady, balance, openAuth, openTokens, openAccount, openProjects, signOut } = useAccount();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isMenuOpen]);

  if (!enabled || !authReady) return null;

  const balanceLabel = balance.status === 'ok' && balance.tokenBalance !== null ? formatTokens(balance.tokenBalance) : '—';

  if (!user) {
    return (
      <button
        onClick={openAuth}
        className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 transition-all flex items-center justify-center cursor-pointer"
        title="Sign in"
      >
        <LogIn size={20} />
      </button>
    );
  }

  const choose = (action: () => void) => () => {
    setIsMenuOpen(false);
    action();
  };

  return (
    <>
      <button
        onClick={() => openTokens(null)}
        className="px-2.5 py-1.5 rounded-xl text-slate-600 hover:bg-slate-100/80 transition-all flex items-center gap-1.5 cursor-pointer"
        title="Tokens — click to see costs and top up"
      >
        <Coins size={15} />
        <span className="text-xs font-bold tabular-nums">{balanceLabel}</span>
      </button>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsMenuOpen(open => !open)}
          className={`p-2 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
            isMenuOpen
              ? 'bg-slate-100 text-slate-900 shadow-sm ring-1 ring-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
          }`}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          title={user.email || 'Account'}
        >
          <UserCircle size={20} />
        </button>

        {isMenuOpen && (
          <div
            className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-xl p-1.5 shadow-2xl shadow-slate-900/12 z-[250] animate-in fade-in zoom-in-95 duration-100 select-none"
            role="menu"
          >
            <div className="px-3 py-2">
              <div className="text-xs font-bold text-slate-900 truncate">{user.displayName || 'Signed in'}</div>
              <div className="text-[10px] text-slate-400 truncate">{user.email}</div>
            </div>
            <div className="my-1 h-px bg-slate-100" />
            <button onClick={choose(openProjects)} className={menuItemClass} role="menuitem">
              <Cloud size={15} className="text-slate-500" />
              <span className="flex-1">My Projects</span>
            </button>
            <button onClick={choose(() => openTokens(null))} className={menuItemClass} role="menuitem">
              <Coins size={15} className="text-slate-500" />
              <span className="flex-1">Tokens</span>
              <span className="text-[10px] font-bold text-slate-400 tabular-nums">{balanceLabel}</span>
            </button>
            <button onClick={choose(openAccount)} className={menuItemClass} role="menuitem">
              <Settings size={15} className="text-slate-500" />
              <span className="flex-1">Account settings</span>
            </button>
            <div className="my-1 h-px bg-slate-100" />
            <button onClick={choose(() => { void signOut(); })} className={menuItemClass} role="menuitem">
              <LogOut size={15} className="text-slate-500" />
              <span className="flex-1">Sign out</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default AccountHeaderControls;
