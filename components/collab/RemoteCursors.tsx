import React from 'react';
import type { Point } from '../../types';
import { worldToScreenPoint } from '../../services/geometry/canvasTransform';
import { sameView, type PresenceView } from '../../services/firebase/presenceThrottle';
import { usePresencePeers } from './usePresence';

// Other people's cursors, drawn as a DOM layer over the canvas. Deliberately NOT part of
// Canvas's render(): peers arrive ~15 times a second and repainting the whole scene for each
// one would cost O(elements). Peers are read here through an external store, so only this
// component re-renders.

interface RemoteCursorsProps {
  view: PresenceView;
  zoom: number;
  offset: Point;
  canvasAngle?: number;
  maxPeers?: number;
}

export const RemoteCursors: React.FC<RemoteCursorsProps> = ({ view, zoom, offset, canvasAngle, maxPeers = 12 }) => {
  const peers = usePresencePeers();

  // A cursor only makes sense to someone looking at the same drawing of the same level.
  const visible = peers
    .filter(peer => peer.cursor && view.viewMode === '2D' && sameView(peer.view, view))
    .slice(0, maxPeers);

  if (visible.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {visible.map(peer => {
        const screen = worldToScreenPoint(peer.cursor as Point, { zoom, offset, canvasAngle });
        return (
          <div
            key={peer.key}
            className="absolute top-0 left-0 will-change-transform"
            style={{ transform: `translate3d(${screen.x}px, ${screen.y}px, 0)`, transition: 'transform 90ms linear' }}
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

export default RemoteCursors;
