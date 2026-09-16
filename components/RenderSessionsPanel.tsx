import React, { useCallback, useEffect, useState } from 'react';
import { Images, Loader2, Trash2, X } from 'lucide-react';
import {
  deleteRenderSession,
  listRenderSessions,
  StorageLimitError,
  type CloudRenderSessionSummary,
} from '../services/firebase/renderSessionsService';

// Saved render sessions. Same structure as ProjectsPanel, in the render canvas's dark palette,
// and above the wizard (z-[310]).

interface RenderSessionsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string | null;
  currentSessionId: string | null;
  onOpenSession: (summary: CloudRenderSessionSummary) => Promise<void>;
}

const sectionLabel = 'text-[10px] font-bold text-slate-500 uppercase tracking-widest';

const formatDate = (date: Date | null) =>
  date ? `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}` : '';

const describeError = (err: any) =>
  err instanceof StorageLimitError ? err.message : err?.message || String(err);

const RenderSessionsPanel: React.FC<RenderSessionsPanelProps> = ({ isOpen, onClose, uid, currentSessionId, onOpenSession }) => {
  const [sessions, setSessions] = useState<CloudRenderSessionSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!uid) return;
    try {
      setSessions(await listRenderSessions(uid));
    } catch (err) {
      setSessions([]);
      setError(describeError(err));
    }
  }, [uid]);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setConfirmDeleteId(null);
      return;
    }
    setSessions(null);
    void refresh();
  }, [isOpen, refresh]);

  // Esc closes this panel without also closing the wizard behind it.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, busy, onClose]);

  if (!isOpen || !uid) return null;

  const handleOpen = async (summary: CloudRenderSessionSummary) => {
    setBusy(summary.id);
    setError(null);
    try {
      await onOpenSession(summary);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (summary: CloudRenderSessionSummary) => {
    setBusy(`delete-${summary.id}`);
    setError(null);
    try {
      await deleteRenderSession(uid, summary.id);
      setConfirmDeleteId(null);
      await refresh();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[310] flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95" role="dialog" aria-modal="true" aria-labelledby="render-sessions-title">
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-900/40">
              <Images size={20} />
            </div>
            <h2 id="render-sessions-title" className="text-lg font-black text-slate-100">Saved sessions</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          {error && <div className="text-xs font-medium text-red-400 bg-red-950/40 border border-red-900/60 rounded-xl px-3 py-2">{error}</div>}

          <div className={sectionLabel}>Your sessions</div>
          {sessions === null ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-slate-500 animate-spin" /></div>
          ) : sessions.length === 0 ? (
            <p className="text-xs font-medium text-slate-500">Nothing saved yet. Press Save to keep this canvas.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {sessions.map(summary => (
                <div key={summary.id} className={`rounded-2xl border overflow-hidden ${summary.id === currentSessionId ? 'border-indigo-500' : 'border-slate-800 hover:border-slate-700'}`}>
                  <button onClick={() => handleOpen(summary)} disabled={!!busy} className="block w-full text-left hover:bg-slate-800/50 disabled:opacity-60">
                    <div className="aspect-[8/5] bg-slate-950 flex items-center justify-center">
                      {busy === summary.id ? (
                        <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
                      ) : summary.thumbnailUrl ? (
                        <img src={summary.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Images className="w-6 h-6 text-slate-700" />
                      )}
                    </div>
                    <div className="px-3 pt-2">
                      <div className="text-xs font-bold text-slate-200 truncate" title={summary.name}>{summary.name}</div>
                      <div className="text-[10px] font-medium text-slate-500">
                        {summary.imageCount} image{summary.imageCount === 1 ? '' : 's'} · {formatDate(summary.updatedAt)}
                      </div>
                    </div>
                  </button>
                  <div className="px-3 pb-2 pt-1 flex justify-end">
                    {confirmDeleteId === summary.id ? (
                      <div className="flex items-center gap-2">
                        <button onClick={() => setConfirmDeleteId(null)} className="text-[10px] font-bold text-slate-400 hover:underline">Cancel</button>
                        <button onClick={() => handleDelete(summary)} disabled={!!busy} className="text-[10px] font-bold text-red-400 hover:underline disabled:opacity-50">
                          {busy === `delete-${summary.id}` ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(summary.id)} className="p-1 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/40" aria-label={`Delete ${summary.name}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RenderSessionsPanel;
