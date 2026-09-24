import React from 'react';
import type { GraphViewport } from '../../src/features/ai-rendering-canvas/types/graph';
import { usePresencePeers } from './usePresence';

// Other people's cursors on the render canvas. Positions arrive in graph coordinates and are
// mapped with this viewer's own pan/zoom, so everyone sees the cursor over the same node.
// Peers come from the presence store directly, so their movement re-renders only this layer.

interface RenderRemoteCursorsProps {
  viewport: GraphViewport;
  maxPeers?: number;
}

export const RenderRemoteCursors: React.FC<RenderRemoteCursorsProps> = ({ viewport, maxPeers = 12 }) => {
  const peers = usePresencePeers();
  const visible = peers.filter(peer => peer.cursor && peer.view?.viewMode === 'render').slice(0, maxPeers);
  if (visible.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {visible.map(peer => {
        const x = peer.cursor!.x * viewport.zoom + viewport.x;
        const y = peer.cursor!.y * viewport.zoom + viewport.y;
        return (
          <div
            key={peer.key}
            className="absolute top-0 left-0 will-change-transform"
            style={{ transform: `translate3d(${x}px, ${y}px, 0)`, transition: 'transform 90ms linear' }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" className="drop-shadow">
              <path
                d="M2 2 L2 14 L5.5 10.8 L8 15.5 L10.5 14.3 L8 9.8 L13 9.4 Z"
                fill={peer.color}
                stroke="#ffffff"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="ml-3 -mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow-lg whitespace-nowrap"
              style={{ backgroundColor: peer.color }}
            >
              {peer.name}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default RenderRemoteCursors;
