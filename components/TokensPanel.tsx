import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Coins, HardDrive, Image as ImageIcon, Loader2, ScanLine, Sparkles, X } from 'lucide-react';
import {
  ACTION_PRICES,
  FREE_STORAGE_BYTES,
  TOKEN_PACKS,
  formatBytes,
  formatTokens,
  pricePer100Tokens,
  type TokenPack,
} from '../services/billing/pricing';
import {
  fetchAccountSummary,
  listRecentLedgerEntries,
  startCheckout,
  type AccountSummary,
  type BalanceSnapshot,
  type LedgerEntry,
} from '../services/billing/balanceClient';

export interface TokenShortfall {
  required?: number;
  balance?: number;
  reason?: string;
}

interface TokensPanelProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string | null;
  email: string | null;
  balance: BalanceSnapshot;
  shortfall?: TokenShortfall | null;
}

const sectionLabel = 'text-[10px] font-bold text-slate-400 uppercase tracking-widest';

const formatEntryDate = (date: Date | null) => {
  if (!date) return '';
  const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day}, ${time}`;
};

const COST_ROWS = [
  { icon: Sparkles, label: 'Generate a floorplan', sublabel: 'Described in words, then digitised', cost: ACTION_PRICES.generateAndConvert },
  { icon: ScanLine, label: 'Convert a floorplan', sublabel: 'Digitise one you already have', cost: ACTION_PRICES.convertOnly },
  { icon: ImageIcon, label: 'AI render', sublabel: 'One rendered image', cost: ACTION_PRICES.render },
];

const TokensPanel: React.FC<TokensPanelProps> = ({ isOpen, onClose, uid, email, balance, shortfall }) => {
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [redirectingPackId, setRedirectingPackId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !uid) return;
    let cancelled = false;
    setError(null);
    setEntries(null);
    fetchAccountSummary()
      .then(result => { if (!cancelled) setSummary(result); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    // A ledger read failure shows an empty list, not an error.
    listRecentLedgerEntries(uid, 25)
      .then(result => { if (!cancelled) setEntries(result); })
      .catch(() => { if (!cancelled) setEntries([]); });
    return () => { cancelled = true; };
  }, [isOpen, uid, balance.tokenBalance]);

  useEffect(() => {
    if (!isOpen) setRedirectingPackId(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const displayBalance = balance.status === 'ok' && balance.tokenBalance !== null
    ? formatTokens(balance.tokenBalance)
    : summary
      ? formatTokens(summary.tokenBalance)
      : '—';

  const packs: TokenPack[] = summary?.packs?.length ? summary.packs : TOKEN_PACKS;
  const paymentsEnabled = summary?.paymentsEnabled ?? false;
  const storage = summary?.storage;
  const usedBytes = storage?.usedBytes ?? balance.storageBytesUsed ?? 0;
  const quotaBytes = storage?.quotaBytes ?? balance.storageQuotaBytes ?? FREE_STORAGE_BYTES;
  const usedPercent = Math.min(100, quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0);

  const handleBuy = async (pack: TokenPack) => {
    setError(null);
    setRedirectingPackId(pack.id);
    try {
      window.location.href = await startCheckout(pack.id, email);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRedirectingPackId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95" role="dialog" aria-modal="true" aria-labelledby="tokens-panel-title">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 rounded-xl text-white shadow-lg shadow-slate-300">
              <Coins size={20} />
            </div>
            <h2 id="tokens-panel-title" className="text-lg font-black text-slate-900">Tokens</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto">
          <div className="p-6 bg-slate-50/50 border-b border-slate-100 space-y-2">
            <div className={sectionLabel}>Balance</div>
            <div className="text-3xl font-black text-slate-900 tabular-nums">{displayBalance}</div>
            {balance.status === 'unreadable' && (
              <div className="flex items-start gap-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Live balance updates are unavailable (the Firestore security rules aren't deployed), so this figure comes from the server.</span>
              </div>
            )}
            {shortfall?.required !== undefined && (
              <div className="flex items-start gap-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  That action needs {formatTokens(shortfall.required)} tokens and you have {formatTokens(shortfall.balance ?? 0)}. Top up below to carry on.
                </span>
              </div>
            )}
          </div>

          <div className="p-6 space-y-3 border-b border-slate-100">
            <div className={sectionLabel}>What things cost</div>
            {COST_ROWS.map(({ icon: Icon, label, sublabel, cost }) => (
              <div key={label} className="flex items-center gap-3">
                <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-800">{label}</div>
                  <div className="text-[10px] font-medium text-slate-400">{sublabel}</div>
                </div>
                <div className="text-sm font-black text-slate-900 tabular-nums">{cost}</div>
              </div>
            ))}
            <p className="text-[10px] font-medium text-slate-400">The 2D and 3D canvas are free to use.</p>
          </div>

          <div className="p-6 space-y-2 border-b border-slate-100">
            <div className={sectionLabel}>Top up</div>
            {packs.map(pack => (
              <button
                key={pack.id}
                onClick={() => handleBuy(pack)}
                disabled={!!redirectingPackId || !paymentsEnabled}
                className="w-full p-3 rounded-2xl border border-slate-100 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent flex items-center gap-3 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-800">{formatTokens(pack.tokens)} tokens</div>
                  <div className="text-[10px] font-medium text-slate-400">{pricePer100Tokens(pack)} per 100 tokens</div>
                </div>
                <div className="text-sm font-black text-slate-900 tabular-nums">${pack.priceUsd.toFixed(2)}</div>
                {redirectingPackId === pack.id
                  ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                  : <ArrowUpRight className="w-4 h-4 text-slate-400" />}
              </button>
            ))}
            {summary && !paymentsEnabled && (
              <div className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                Card payments aren't switched on for this deployment yet.
              </div>
            )}
          </div>

          <div className="p-6 space-y-2 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className={`${sectionLabel} flex items-center gap-1.5`}>
                <HardDrive className="w-3 h-3" /> Storage
              </div>
              <div className="text-xs font-bold text-slate-600 tabular-nums">{formatBytes(usedBytes)} of {formatBytes(quotaBytes)}</div>
            </div>
            <div className="h-[2px] bg-slate-100 overflow-hidden">
              <div className={`h-full ${usedPercent >= 100 ? 'bg-red-500' : 'bg-slate-900'}`} style={{ width: `${usedPercent}%` }} />
            </div>
            {storage && !storage.metered && (
              <p className="text-[10px] font-medium text-slate-400">Storage metering isn't switched on for this deployment.</p>
            )}
          </div>

          <div className="p-6 space-y-2">
            <div className={sectionLabel}>Recent activity</div>
            {entries === null ? (
              <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 text-slate-400 animate-spin" /></div>
            ) : entries.length === 0 ? (
              <p className="text-xs font-medium text-slate-400">Nothing yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {entries.map(entry => (
                  <div key={entry.id} className="flex items-center gap-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-700 truncate">{entry.detail || entry.reason || entry.type}</div>
                      <div className="text-[10px] font-medium text-slate-400">{formatEntryDate(entry.createdAt)}</div>
                    </div>
                    <div className={`text-xs font-black tabular-nums ${entry.amount > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {entry.amount > 0 ? `+${formatTokens(entry.amount)}` : `-${formatTokens(Math.abs(entry.amount))}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="px-6 pb-6">
              <div className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TokensPanel;
