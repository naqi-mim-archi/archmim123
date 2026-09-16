import React from 'react';
import { Box } from 'lucide-react';
import { describeView, initialsFor, type PresenceView } from '../../services/firebase/presenceThrottle';
import type { PresencePeer } from '../../services/firebase/presenceService';
import { usePresencePeers } from './usePresence';

// Who else is in this plan right now. Click an avatar to jump to what they are looking at.

interface PresenceBarProps {
  levelNameFor?: (levelId: string) => string | undefined;
  onFollow?: (peer: PresencePeer) => void;
  maxAvatars?: number;
}

export const PresenceBar: React.FC<PresenceBarProps> = ({ levelNameFor, onFollow, maxAvatars = 4 }) => {
  const peers = usePresencePeers();
  if (peers.length === 0) return null;

  const shown = peers.slice(0, maxAvatars);
  const overflow = peers.length - shown.length;

  const describe = (view: PresenceView | null) => describeView(view, view ? levelNameFor?.(view.activeLevelId) : undefined);

  return (
    <div className="flex items-center -space-x-2 mr-1">
      {shown.map(peer => (
        <button
          key={peer.key}
          onClick={() => onFollow?.(peer)}
          title={`${peer.name} — ${describe(peer.view)}${onFollow ? ' (click to follow)' : ''}`}
          className="relative w-7 h-7 rounded-full ring-2 ring-white shadow-sm overflow-hidden cursor-pointer hover:z-10 hover:scale-110 transition-transform flex items-center justify-center"
          style={{ backgroundColor: peer.color }}
        >
          {peer.photoURL
            ? <img src={peer.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            : <span className="text-[10px] font-black text-white">{initialsFor(peer.name)}</span>}
          {peer.view?.viewMode === '3D' && (
            <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-indigo-600 p-[2px] ring-1 ring-white">
              <Box size={8} className="text-white" />
            </span>
          )}
        </button>
      ))}
      {overflow > 0 && (
        <div className="w-7 h-7 rounded-full ring-2 ring-white bg-slate-200 text-[10px] font-black text-slate-600 flex items-center justify-center">
          +{overflow}
        </div>
      )}
    </div>
  );
};

export default PresenceBar;
