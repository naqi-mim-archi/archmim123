import React from 'react';
import { 
  Sparkles, 
  ChevronLeft,
  GitFork
} from 'lucide-react';

interface HubDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sourceNodeTitle?: string;
  sourceNodeImageUrl?: string;
  children: React.ReactNode;
}

export const HubDrawer: React.FC<HubDrawerProps> = ({
  isOpen,
  onClose,
  sourceNodeTitle,
  sourceNodeImageUrl,
  children,
}) => {
  if (!isOpen) return null;

  return (
    <div className="w-[380px] bg-slate-900 border-r border-slate-800 flex flex-col h-full shrink-0 z-30 shadow-2xl transition-all select-none">
      {/* 1. Header */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/80 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-400" />
            <h3 className="text-xs font-bold text-slate-100 tracking-wide">Rendering Workflows</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Back"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>

      {/* 2. Source Image Context Banner (When branching from a node) */}
      {sourceNodeTitle && (
        <div className="px-3.5 py-2 bg-indigo-950/40 border-b border-indigo-800/40 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <GitFork size={13} className="text-indigo-400 shrink-0" />
            <span className="text-[11px] text-indigo-200 truncate">
              Branching from: <strong className="text-white">{sourceNodeTitle}</strong>
            </span>
          </div>
          {sourceNodeImageUrl && (
            <img
              src={sourceNodeImageUrl}
              alt="Source"
              className="w-7 h-7 rounded-md object-cover border border-indigo-700/60 shrink-0"
            />
          )}
        </div>
      )}

      {/* 3. Workflow Configuration Form Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 scrollbar-thin text-xs">
        {children}
      </div>
    </div>
  );
};
