import React, { useEffect } from 'react';
import { Eye, PencilLine, Users, X } from 'lucide-react';
import type { ProjectRole } from '../services/firebase/shareAccess';

// Welcome shown when someone opens a shared plan or render session from a link, so they
// know whose work it is and what they can do with it.

export interface SharedArrival {
  kind: 'project' | 'session';
  name: string;
  ownerEmail: string | null;
  role: ProjectRole;
}

interface SharedArrivalDialogProps {
  arrival: SharedArrival | null;
  onClose: () => void;
}

const SharedArrivalDialog: React.FC<SharedArrivalDialogProps> = ({ arrival, onClose }) => {
  useEffect(() => {
    if (!arrival) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [arrival, onClose]);

  if (!arrival) return null;

  const kindLabel = arrival.kind === 'session' ? 'render session' : 'plan';
  const canEdit = arrival.role === 'editor';
  const sharer = arrival.ownerEmail || 'Someone';

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[320] flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 space-y-6 animate-in fade-in zoom-in-95" role="dialog" aria-modal="true" aria-labelledby="shared-arrival-title">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 rounded-xl text-white shadow-lg shadow-slate-300">
              <Users size={20} />
            </div>
            <h2 id="shared-arrival-title" className="text-lg font-black text-slate-900">Shared with you</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">
            <span className="font-bold text-slate-900">{sharer}</span> shared the {kindLabel}
          </p>
          <p className="text-base font-black text-slate-900 break-words">&ldquo;{arrival.name}&rdquo;</p>
        </div>

        <div className={`flex items-start gap-2 text-xs font-medium rounded-xl px-3 py-2 border ${canEdit ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-slate-600 bg-slate-50 border-slate-100'}`}>
          {canEdit ? <PencilLine className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <Eye className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <span>
            {canEdit
              ? 'You can edit this. Changes you save are saved to the shared copy.'
              : `You can view this. To make changes, save your own copy${arrival.kind === 'session' ? ' with Save session' : ''}.`}
          </span>
        </div>

        <button
          onClick={onClose}
          className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800"
          autoFocus
        >
          Open {kindLabel}
        </button>
      </div>
    </div>
  );
};

export default SharedArrivalDialog;
