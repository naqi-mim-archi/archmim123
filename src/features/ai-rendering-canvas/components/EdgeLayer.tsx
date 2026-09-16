import React from 'react';
import { CanvasEdge, CanvasNodeData, PendingConnection } from '../types/graph';
import { GraphEngine } from '../core/GraphEngine';

interface EdgeLayerProps {
  nodes: CanvasNodeData[];
  edges: CanvasEdge[];
  pendingConnection: PendingConnection | null;
  onRemoveEdge: (edgeId: string) => void;
}

export const EdgeLayer: React.FC<EdgeLayerProps> = ({
  nodes,
  edges,
  pendingConnection,
  onRemoveEdge,
}) => {
  const nodeMap = React.useMemo(() => {
    const map = new Map<string, CanvasNodeData>();
    for (const node of nodes) {
      map.set(node.id, node);
    }
    return map;
  }, [nodes]);

  return (
    <svg 
      className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-0"
      style={{ minWidth: '100%', minHeight: '100%' }}
    >
      <defs>
        {/* Glow Filters */}
        <filter id="edge-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        {/* Gradients */}
        <linearGradient id="edge-grad-active" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#818cf8" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#c084fc" stopOpacity="0.8" />
        </linearGradient>

        <linearGradient id="edge-grad-pending" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.9" />
        </linearGradient>

        {/* Marker arrowhead */}
        <marker
          id="edge-arrow"
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#818cf8" />
        </marker>
      </defs>

      {/* Render Committed Edges */}
      {edges.map(edge => {
        const sourceNode = nodeMap.get(edge.sourceNodeId);
        const targetNode = nodeMap.get(edge.targetNodeId);
        if (!sourceNode || !targetNode) return null;

        const p1 = GraphEngine.getOutputPortPosition(sourceNode);
        const p2 = GraphEngine.getInputPortPosition(targetNode);
        const pathData = GraphEngine.calculateBezierPath(p1, p2);

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        return (
          <g key={edge.id} className="edge-item group pointer-events-auto cursor-pointer">
            {/* Wide transparent hit stroke for easy hovering */}
            <path
              d={pathData}
              fill="none"
              stroke="transparent"
              strokeWidth="28"
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
            />

            {/* Background ambient stroke */}
            <path
              d={pathData}
              fill="none"
              stroke="#1e1b4b"
              strokeWidth="5"
              strokeOpacity="0.6"
            />

            {/* Main Crisp Bezier Stroke */}
            <path
              d={pathData}
              fill="none"
              stroke="url(#edge-grad-active)"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="transition-all group-hover:stroke-rose-400"
            />

            {/* Flow Animated Pulsing Line */}
            {edge.animated && (
              <path
                d={pathData}
                fill="none"
                stroke="#ffffff"
                strokeWidth="2"
                strokeDasharray="6 14"
                strokeOpacity="0.7"
                className="animate-flow-dash"
              />
            )}

            {/* Port Connector Anchors */}
            <circle cx={p1.x} cy={p1.y} r="3.5" fill="#818cf8" />
            <circle cx={p2.x} cy={p2.y} r="3.5" fill="#c084fc" />

            {/* Midpoint Disconnect Button (Shown on hover) */}
            <g
              className="edge-delete-btn opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer"
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                onRemoveEdge(edge.id);
              }}
              onClick={(e) => {
                e.stopPropagation();
                onRemoveEdge(edge.id);
              }}
            >
              {/* Invisible large hit area for comfortable clicking */}
              <circle cx={midX} cy={midY} r="18" fill="transparent" />
              {/* Glow filter backdrop */}
              <circle cx={midX} cy={midY} r="12" fill="#0f172a" stroke="#f43f5e" strokeWidth="2" />
              {/* Crisp 'X' icon lines */}
              <line x1={midX - 4} y1={midY - 4} x2={midX + 4} y2={midY + 4} stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
              <line x1={midX + 4} y1={midY - 4} x2={midX - 4} y2={midY + 4} stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
            </g>
          </g>
        );
      })}

      {/* Render Active Pending Connection Drag Line */}
      {pendingConnection && (() => {
        const sourceNode = nodeMap.get(pendingConnection.sourceNodeId);
        if (!sourceNode) return null;

        const p1 = GraphEngine.getOutputPortPosition(sourceNode);
        const p2 = pendingConnection.currentMousePos;
        const pathData = GraphEngine.calculateBezierPath(p1, p2);

        return (
          <g className="pointer-events-none">
            {/* Background shadow */}
            <path
              d={pathData}
              fill="none"
              stroke="#312e81"
              strokeWidth="4"
              strokeOpacity="0.5"
            />

            {/* Dashed glowing active connection */}
            <path
              d={pathData}
              fill="none"
              stroke="url(#edge-grad-pending)"
              strokeWidth="2.5"
              strokeDasharray="6 6"
              filter="url(#edge-glow)"
            />

            {/* Starting Anchor */}
            <circle cx={p1.x} cy={p1.y} r="5" fill="#6366f1" />

            {/* Live Cursor Target Ring */}
            <circle
              cx={p2.x}
              cy={p2.y}
              r="6"
              fill="#38bdf8"
              fillOpacity="0.3"
              stroke="#38bdf8"
              strokeWidth="2"
            />
          </g>
        );
      })()}
    </svg>
  );
};
