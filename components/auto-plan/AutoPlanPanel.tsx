import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, DoorOpen, Loader2, MousePointer2, Plus, RefreshCw, Trash2, Upload, Wand2, X } from 'lucide-react';
import { ArchElement, Point, UnitSystem } from '../../types';
import { generateAutoPlan } from '../../services/autoPlan/autoPlanApi';
import { autoPlanPayloadToArchElements } from '../../services/autoPlan/autoPlanImport';
import { defaultAutoPlanBriefInput } from '../../services/autoPlan/autoPlanParser';
import {
  AUTO_PLAN_MODEL_PATH_DEFAULT,
  AUTO_PLAN_PROTOTYPE_PATH_DEFAULT,
  AUTO_PLAN_RESIDENTIAL_OPTIONS,
  AutoPlanBoundary,
  AutoPlanBriefInput,
  AutoPlanGenerationStage,
  AutoPlanImportPayload,
  AutoPlanOpening,
  AutoPlanRoomNode,
  AutoPlanWallSegment,
} from '../../services/autoPlan/autoPlanTypes';
import { makeRectangleBoundary, polygonArea, validateAutoPlanBoundary, validateAutoPlanPayload } from '../../services/autoPlan/autoPlanValidation';

interface AutoPlanPanelProps {
  currentBoundary?: Point[];
  unitSystem: UnitSystem;
  onApply: (elements: ArchElement[]) => void;
  onClose: () => void;
}

type BoundaryMode = 'rectangle' | 'polygon' | 'dimensions';

const ROOM_SPACE_OPTIONS = [
  { id: 'dining', label: 'Dining' },
  { id: 'master_bedroom', label: 'Master Bedroom' },
  { id: 'study_room', label: 'Study' },
  { id: 'storage', label: 'Storage' },
  { id: 'entrance', label: 'Entrance / Foyer' },
  { id: 'corridor', label: 'Corridor' },
  { id: 'utility', label: 'Utility / Laundry' },
  { id: 'powder_room', label: 'Powder / WC' },
  { id: 'terrace', label: 'Terrace' },
  { id: 'stair', label: 'Stair' },
];

const stageOrder: AutoPlanGenerationStage[] = ['setup', 'nodes', 'walls', 'openings', 'import'];

const stageLabel: Record<AutoPlanGenerationStage, string> = {
  setup: 'Setup',
  nodes: 'Room Nodes',
  walls: 'Walls',
  openings: 'Openings',
  import: 'Import',
};

const inputClass = 'w-full h-9 rounded-xl bg-slate-50 border border-slate-200 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500';
const textareaSmallClass = 'w-full h-16 rounded-xl bg-slate-50 border border-slate-200 p-2 text-xs text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500';
const miniButtonClass = 'flex-1 h-8 rounded-lg bg-slate-50 border border-slate-200 text-[10px] font-black text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-1';
const actionButtonClass = 'h-9 px-3 rounded-xl bg-white border border-slate-200 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5';
const primaryButtonClass = 'h-9 px-4 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 flex items-center gap-1.5';

const defaultsForResidentialType = (type: AutoPlanBriefInput['residentialType']) => {
  if (type === 'Studio') return { bedrooms: 0, bathrooms: 1, balconies: 0 };
  const bedroomMatch = type.match(/^(\d)\s+Bedroom$/);
  if (bedroomMatch) {
    const bedrooms = Number(bedroomMatch[1]);
    return { bedrooms, bathrooms: bedrooms <= 1 ? 1 : bedrooms <= 3 ? 2 : 3, balconies: bedrooms >= 2 ? 1 : 0 };
  }
  if (type === 'Villa') return { bedrooms: 4, bathrooms: 3, balconies: 0 };
  if (type === 'Mansion') return { bedrooms: 5, bathrooms: 4, balconies: 0 };
  if (type === 'Co-living') return { bedrooms: 6, bathrooms: 3, balconies: 0 };
  if (type === 'Student Housing') return { bedrooms: 8, bathrooms: 3, balconies: 0 };
  if (type === 'Senior Living') return { bedrooms: 1, bathrooms: 1, balconies: 0 };
  return { bedrooms: 3, bathrooms: 2, balconies: type === 'Penthouse' ? 2 : 1 };
};

const boundsOf = (points: Point[]) => {
  if (!points.length) return { minX: 0, minY: 0, maxX: 10, maxY: 10, width: 10, height: 10 };
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
};

const wallPointAt = (wall: AutoPlanWallSegment, t: number): Point => ({
  x: wall.start.x + (wall.end.x - wall.start.x) * t,
  y: wall.start.y + (wall.end.y - wall.start.y) * t,
});

const AutoPlanPanel: React.FC<AutoPlanPanelProps> = ({ currentBoundary, unitSystem, onApply, onClose }) => {
  const [stage, setStage] = useState<AutoPlanGenerationStage>('setup');
  const [boundaryMode, setBoundaryMode] = useState<BoundaryMode>(currentBoundary?.length ? 'polygon' : 'dimensions');
  const [dimensionWidth, setDimensionWidth] = useState('15');
  const [dimensionHeight, setDimensionHeight] = useState('10');
  const [polygonPoints, setPolygonPoints] = useState<Point[]>(currentBoundary || []);
  const [briefInput, setBriefInput] = useState<AutoPlanBriefInput>(defaultAutoPlanBriefInput());
  const [payload, setPayload] = useState<AutoPlanImportPayload | null>(null);
  const [nodes, setNodes] = useState<AutoPlanRoomNode[]>([]);
  const [walls, setWalls] = useState<AutoPlanWallSegment[]>([]);
  const [openings, setOpenings] = useState<AutoPlanOpening[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [dragWall, setDragWall] = useState<{ id: string; anchor: Point; start: Point; end: Point } | null>(null);
  const [dragOpeningId, setDragOpeningId] = useState<string | null>(null);
  const [addNodeType, setAddNodeType] = useState('study_room');
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('Boundary and brief are required before generation.');
  const [runtimeStatus, setRuntimeStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  const activeBoundary: AutoPlanBoundary = useMemo(() => {
    const width = Math.max(0.1, Number(dimensionWidth) || 0);
    const height = Math.max(0.1, Number(dimensionHeight) || 0);
    if (boundaryMode === 'polygon') {
      return {
        type: 'polygon',
        points: polygonPoints,
        area: polygonArea(polygonPoints),
        units: unitSystem,
      };
    }
    return {
      ...makeRectangleBoundary(width, height, unitSystem),
      type: boundaryMode,
    };
  }, [boundaryMode, dimensionWidth, dimensionHeight, polygonPoints, unitSystem]);

  const allPreviewPoints = useMemo(() => {
    const points = [...activeBoundary.points];
    nodes.forEach(node => points.push({ x: node.x, y: node.y }));
    walls.forEach(wall => points.push(wall.start, wall.end));
    return points;
  }, [activeBoundary.points, nodes, walls]);

  const view = useMemo(() => {
    const b = boundsOf(allPreviewPoints);
    const pad = Math.max(1, Math.max(b.width, b.height) * 0.15);
    const minX = b.minX - pad;
    const maxX = b.maxX + pad;
    const minY = b.minY - pad;
    const maxY = b.maxY + pad;
    const width = maxX - minX;
    const height = maxY - minY;
    return { minX, maxX, minY, maxY, width, height };
  }, [allPreviewPoints]);

  const toScreen = (point: Point) => {
    const width = 820;
    const height = 460;
    return {
      x: ((point.x - view.minX) / view.width) * width,
      y: ((view.maxY - point.y) / view.height) * height,
    };
  };

  const fromPointer = (event: React.PointerEvent<SVGSVGElement | SVGCircleElement | SVGLineElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const sx = ((event.clientX - rect.left) / rect.width) * 820;
    const sy = ((event.clientY - rect.top) / rect.height) * 460;
    return {
      x: view.minX + (sx / 820) * view.width,
      y: view.maxY - (sy / 460) * view.height,
    };
  };

  const setBrief = (patch: Partial<AutoPlanBriefInput>) => {
    setBriefInput(prev => ({ ...prev, ...patch }));
  };

  const toggleSpace = (field: 'requiredSpaces' | 'optionalSpaces', space: string) => {
    setBriefInput(prev => {
      const current = new Set(prev[field]);
      if (current.has(space)) current.delete(space);
      else current.add(space);
      return { ...prev, [field]: Array.from(current) };
    });
  };

  const refreshRuntimeStatus = async (shouldUpdate: () => boolean = () => true) => {
    try {
      const response = await fetch('/api/auto-plan/status');
      const data = await response.json();
      const nextStatus = data.status || data;
      if (shouldUpdate()) setRuntimeStatus(nextStatus);
      return nextStatus;
    } catch {
      const fallback = { state: 'status_unavailable', message: 'Auto Plan status endpoint is not available yet.' };
      if (shouldUpdate()) setRuntimeStatus((prev: any) => prev || fallback);
      return fallback;
    }
  };

  const handleGenerate = async () => {
    const boundaryErrors = validateAutoPlanBoundary(activeBoundary);
    if (boundaryErrors.length) {
      setError(boundaryErrors.join(' '));
      return;
    }
    setIsGenerating(true);
    setError(null);
    setWarnings([]);
    setRuntimeStatus(null);
    setStatus('Loading HouseDiffusion and running Auto Plan inference. CPU runs can take a few minutes...');
    try {
      const result = await generateAutoPlan({
        boundary: activeBoundary,
        briefInput,
        stage: 'nodes',
        unitSystem,
      });
      setPayload(result.payload);
      setNodes(result.payload.nodes);
      setWalls(result.payload.walls);
      setOpenings(result.payload.openings);
      setWarnings(result.warnings || []);
      setStage('nodes');
      setStatus(`Generated ${result.payload.nodes.length} nodes, ${result.payload.walls.length} walls, and ${result.payload.openings.length} rule-based openings.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('Auto Plan generation failed.');
    } finally {
      await refreshRuntimeStatus();
      setIsGenerating(false);
    }
  };

  const currentPayload = (): AutoPlanImportPayload | null => {
    if (!payload) return null;
    return {
      ...payload,
      nodes,
      walls,
      openings,
      boundary: activeBoundary,
      metadata: {
        ...payload.metadata,
        createdAt: payload.metadata.createdAt,
        diagnostics: {
          ...(payload.metadata.diagnostics || {}),
          userEditedNodes: nodes.some(node => node.source === 'user'),
          userEditedWalls: walls.some(wall => wall.source === 'user'),
          userEditedOpenings: openings.some(opening => opening.source === 'user'),
        },
      },
    };
  };

  const handleApprove = () => {
    if (stage === 'nodes') {
      setStage('walls');
      setStatus('Room nodes approved. Review or edit wall segments.');
    } else if (stage === 'walls') {
      setStage('openings');
      setStatus('Walls approved. Review doors, windows, and wall openings.');
    } else if (stage === 'openings') {
      setStage('import');
      const next = currentPayload();
      setWarnings(next ? validateAutoPlanPayload(next) : []);
      setStatus('Final Auto Plan payload is ready to import as native canvas elements.');
    }
  };

  const handleBack = () => {
    const index = stageOrder.indexOf(stage);
    setStage(stageOrder[Math.max(0, index - 1)]);
  };

  const handleImport = () => {
    const next = currentPayload();
    if (!next) return;
    const validation = validateAutoPlanPayload(next);
    if (validation.length) {
      setWarnings(validation);
      setError('Resolve validation issues before import.');
      return;
    }
    const converted = autoPlanPayloadToArchElements(next);
    onApply(converted.elements);
    onClose();
  };

  const handleSvgPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (stage === 'setup' && boundaryMode === 'polygon') {
      const point = fromPointer(event);
      setPolygonPoints(prev => [...prev, { x: Number(point.x.toFixed(2)), y: Number(point.y.toFixed(2)) }]);
      setError(null);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const point = fromPointer(event);
    if (dragNodeId) {
      setNodes(prev => prev.map(node => node.id === dragNodeId ? { ...node, x: point.x, y: point.y, source: node.source === 'model' ? 'user' : node.source } : node));
    }
    if (dragWall) {
      const dx = point.x - dragWall.anchor.x;
      const dy = point.y - dragWall.anchor.y;
      setWalls(prev => prev.map(wall => wall.id === dragWall.id ? {
        ...wall,
        start: { x: dragWall.start.x + dx, y: dragWall.start.y + dy },
        end: { x: dragWall.end.x + dx, y: dragWall.end.y + dy },
        source: wall.source === 'model' ? 'user' : wall.source,
      } : wall));
    }
    if (dragOpeningId) {
      const opening = openings.find(item => item.id === dragOpeningId);
      const host = opening ? walls.find(wall => wall.id === opening.hostWallId) : undefined;
      if (opening && host) {
        const dx = host.end.x - host.start.x;
        const dy = host.end.y - host.start.y;
        const lenSq = dx * dx + dy * dy;
        const t = lenSq <= 0 ? opening.position : ((point.x - host.start.x) * dx + (point.y - host.start.y) * dy) / lenSq;
        setOpenings(prev => prev.map(item => item.id === dragOpeningId ? {
          ...item,
          position: Math.max(0.08, Math.min(0.92, t)),
          source: item.source === 'rule' || item.source === 'model' ? 'user' : item.source,
        } : item));
      }
    }
  };

  const stopDragging = () => {
    setDragNodeId(null);
    setDragWall(null);
    setDragOpeningId(null);
  };

  const addOptionalNode = () => {
    const center = centroidForBoundary(activeBoundary.points);
    const label = ROOM_SPACE_OPTIONS.find(item => item.id === addNodeType)?.label || addNodeType;
    setNodes(prev => [...prev, {
      id: `ap-node-user-${Date.now()}`,
      type: addNodeType,
      label,
      x: center.x + prev.length * 0.2,
      y: center.y + prev.length * 0.2,
      radius: 0.8,
      required: false,
      source: 'user',
    }]);
  };

  const deleteSelectedNode = () => {
    if (!selectedNodeId) return;
    setNodes(prev => prev.filter(node => node.id !== selectedNodeId || node.locked));
    setSelectedNodeId(null);
  };

  const addWall = () => {
    const b = boundsOf(activeBoundary.points);
    setWalls(prev => [...prev, {
      id: `ap-wall-user-${Date.now()}`,
      start: { x: b.minX + b.width * 0.25, y: b.minY + b.height * 0.5 },
      end: { x: b.minX + b.width * 0.75, y: b.minY + b.height * 0.5 },
      thickness: 0.15,
      wallType: 'interior',
      source: 'user',
    }]);
  };

  const deleteSelectedWall = () => {
    if (!selectedWallId) return;
    setWalls(prev => prev.filter(wall => wall.id !== selectedWallId));
    setOpenings(prev => prev.filter(opening => opening.hostWallId !== selectedWallId));
    setSelectedWallId(null);
  };

  const deleteSelectedOpening = () => {
    if (!selectedOpeningId) return;
    setOpenings(prev => prev.filter(opening => opening.id !== selectedOpeningId));
    setSelectedOpeningId(null);
  };

  const selectedCategoryTypes = AUTO_PLAN_RESIDENTIAL_OPTIONS.find(item => item.category === briefInput.category)?.types || AUTO_PLAN_RESIDENTIAL_OPTIONS[0].types;
  const validationErrors = validateAutoPlanBoundary(activeBoundary);

  useEffect(() => {
    if (!isGenerating) return;
    let active = true;
    const poll = async () => {
      if (!active) return;
      await refreshRuntimeStatus(() => active);
    };
    poll();
    const timer = window.setInterval(poll, 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isGenerating]);

  return (
    <div className="flex-1 min-h-0 grid grid-cols-[320px_1fr] bg-slate-50">
      <aside className="border-r border-slate-200 bg-white overflow-y-auto p-4 space-y-5">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">AI Gen</div>
          <h3 className="text-xl font-black text-slate-900 mt-1">Auto Plan</h3>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">AI residential floorplan generation with staged approval and native canvas import.</p>
        </div>

        <section className="space-y-3">
          <SectionTitle title="1. Boundary" />
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {(['dimensions', 'rectangle', 'polygon'] as BoundaryMode[]).map(mode => (
              <button key={mode} onClick={() => setBoundaryMode(mode)} className={`px-2 py-1.5 rounded-lg text-[10px] font-black uppercase ${boundaryMode === mode ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>
                {mode}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Width">
              <input value={dimensionWidth} onChange={event => setDimensionWidth(event.target.value)} className={inputClass} />
            </Field>
            <Field label="Height">
              <input value={dimensionHeight} onChange={event => setDimensionHeight(event.target.value)} className={inputClass} />
            </Field>
          </div>
          {boundaryMode === 'polygon' && (
            <div className="flex gap-2">
              <button onClick={() => setPolygonPoints(currentBoundary || [])} className={miniButtonClass}><Upload size={13} /> Use Canvas</button>
              <button onClick={() => setPolygonPoints([])} className={miniButtonClass}><X size={13} /> Clear</button>
            </div>
          )}
          <div className={`text-[11px] leading-relaxed ${validationErrors.length ? 'text-rose-600' : 'text-slate-500'}`}>
            {validationErrors.length ? validationErrors[0] : `Area: ${polygonArea(activeBoundary.points).toFixed(1)} sq ${unitSystem === 'metric' ? 'm' : 'project units'}`}
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle title="2. Residential Brief" />
          <textarea
            value={briefInput.prompt}
            onChange={event => setBrief({ prompt: event.target.value })}
            className="w-full h-24 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <Field label="Category">
            <select value={briefInput.category} onChange={event => {
              const category = event.target.value as AutoPlanBriefInput['category'];
              const firstType = AUTO_PLAN_RESIDENTIAL_OPTIONS.find(item => item.category === category)?.types[0] || 'Other / Custom Residential';
              setBrief({ category, residentialType: firstType, ...defaultsForResidentialType(firstType) });
            }} className={inputClass}>
              {AUTO_PLAN_RESIDENTIAL_OPTIONS.map(item => <option key={item.category}>{item.category}</option>)}
            </select>
          </Field>
          <Field label="Residential Type">
            <select value={briefInput.residentialType} onChange={event => {
              const residentialType = event.target.value as AutoPlanBriefInput['residentialType'];
              setBrief({ residentialType, ...defaultsForResidentialType(residentialType) });
            }} className={inputClass}>
              {selectedCategoryTypes.map(type => <option key={type}>{type}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Counter label="Bedrooms" value={briefInput.bedrooms} min={0} max={12} onChange={value => setBrief({ bedrooms: value })} />
            <Counter label="Bathrooms" value={briefInput.bathrooms} min={1} max={10} onChange={value => setBrief({ bathrooms: value })} />
            <Counter label="Kitchens" value={briefInput.kitchens} min={1} max={3} onChange={value => setBrief({ kitchens: value })} />
            <Counter label="Balconies" value={briefInput.balconies} min={0} max={5} onChange={value => setBrief({ balconies: value })} />
          </div>
          <label className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">
            Open kitchen
            <input type="checkbox" checked={briefInput.openKitchen} onChange={event => setBrief({ openKitchen: event.target.checked })} />
          </label>
          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Required / Optional Spaces</div>
            <div className="flex flex-wrap gap-1.5">
              {ROOM_SPACE_OPTIONS.map(space => {
                const required = briefInput.requiredSpaces.includes(space.id);
                const optional = briefInput.optionalSpaces.includes(space.id);
                return (
                  <button
                    key={space.id}
                    onClick={() => toggleSpace(required ? 'requiredSpaces' : 'optionalSpaces', space.id)}
                    onContextMenu={event => {
                      event.preventDefault();
                      toggleSpace('optionalSpaces', space.id);
                    }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${required ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : optional ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-500'}`}
                    title="Click toggles required. Right-click toggles optional."
                  >
                    {space.label}
                  </button>
                );
              })}
            </div>
          </div>
          <Field label="Adjacency Notes">
            <textarea value={briefInput.adjacencyNotes} onChange={event => setBrief({ adjacencyNotes: event.target.value })} className={textareaSmallClass} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Must Have"><textarea value={briefInput.mustHave} onChange={event => setBrief({ mustHave: event.target.value })} className={textareaSmallClass} /></Field>
            <Field label="Must Not"><textarea value={briefInput.mustNotHave} onChange={event => setBrief({ mustNotHave: event.target.value })} className={textareaSmallClass} /></Field>
          </div>
        </section>

        <button
          onClick={handleGenerate}
          disabled={isGenerating || validationErrors.length > 0}
          className="w-full py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
          {payload ? 'Regenerate' : 'Generate'}
        </button>
      </aside>

      <main className="min-w-0 min-h-0 flex flex-col p-5 gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-2">
            {stageOrder.slice(1).map(item => (
              <div key={item} className={`px-3 py-2 rounded-xl border text-xs font-black ${stage === item ? 'bg-indigo-600 border-indigo-600 text-white' : stageOrder.indexOf(stage) > stageOrder.indexOf(item) ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                {stageLabel[item]}
              </div>
            ))}
          </div>
          <div className="text-right text-[10px] text-slate-400 font-bold">
            Model: HouseDiffusion<br />
            Weights: {AUTO_PLAN_MODEL_PATH_DEFAULT.split('\\').slice(-2).join('\\')}
          </div>
        </div>

        <div className="flex-1 min-h-0 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden relative">
          <svg
            ref={svgRef}
            viewBox="0 0 820 460"
            className="w-full h-full touch-none bg-slate-50"
            onPointerDown={handleSvgPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDragging}
            onPointerLeave={stopDragging}
          >
            <defs>
              <pattern id="auto-plan-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e2e8f0" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="820" height="460" fill="url(#auto-plan-grid)" />
            {activeBoundary.points.length >= 2 && (
              <polygon
                points={activeBoundary.points.map(point => {
                  const screen = toScreen(point);
                  return `${screen.x},${screen.y}`;
                }).join(' ')}
                fill="#dbeafe"
                fillOpacity="0.28"
                stroke="#2563eb"
                strokeWidth="2"
              />
            )}
            {boundaryMode === 'polygon' && stage === 'setup' && polygonPoints.map((point, index) => {
              const screen = toScreen(point);
              return <circle key={`${point.x}-${point.y}-${index}`} cx={screen.x} cy={screen.y} r="4" fill="#2563eb" />;
            })}
            {(stage === 'walls' || stage === 'openings' || stage === 'import') && walls.map(wall => {
              const a = toScreen(wall.start);
              const b = toScreen(wall.end);
              return (
                <line
                  key={wall.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={selectedWallId === wall.id ? '#4f46e5' : wall.wallType === 'exterior' ? '#0f172a' : '#475569'}
                  strokeWidth={Math.max(3, wall.thickness * 18)}
                  strokeLinecap="round"
                  className="cursor-move"
                  onPointerDown={event => {
                    event.stopPropagation();
                    const anchor = fromPointer(event);
                    setSelectedWallId(wall.id);
                    setSelectedNodeId(null);
                    setSelectedOpeningId(null);
                    setDragWall({ id: wall.id, anchor, start: wall.start, end: wall.end });
                  }}
                />
              );
            })}
            {(stage === 'nodes' || stage === 'walls' || stage === 'openings' || stage === 'import') && nodes.map(node => {
              const screen = toScreen({ x: node.x, y: node.y });
              return (
                <g key={node.id} transform={`translate(${screen.x} ${screen.y})`} className="cursor-move">
                  <circle
                    r={Math.max(14, (node.radius || 0.8) * 13)}
                    fill={node.locked ? '#fee2e2' : node.required ? '#eef2ff' : '#fef3c7'}
                    stroke={selectedNodeId === node.id ? '#4f46e5' : node.locked ? '#ef4444' : '#6366f1'}
                    strokeWidth="2"
                    onPointerDown={event => {
                      event.stopPropagation();
                      setSelectedNodeId(node.id);
                      setSelectedWallId(null);
                      setSelectedOpeningId(null);
                      setDragNodeId(node.id);
                    }}
                  />
                  <text y="4" textAnchor="middle" className="select-none text-[10px] font-black fill-slate-700 pointer-events-none">{node.label}</text>
                </g>
              );
            })}
            {(stage === 'openings' || stage === 'import') && openings.map(opening => {
              const host = walls.find(wall => wall.id === opening.hostWallId);
              if (!host) return null;
              const point = wallPointAt(host, opening.position);
              const screen = toScreen(point);
              const color = opening.type === 'door' ? '#b45309' : opening.type === 'window' ? '#0284c7' : '#16a34a';
              return (
                <g key={opening.id} transform={`translate(${screen.x} ${screen.y})`} className="cursor-ew-resize">
                  <rect
                    x="-9"
                    y="-9"
                    width="18"
                    height="18"
                    rx="3"
                    fill={selectedOpeningId === opening.id ? '#fef3c7' : '#ffffff'}
                    stroke={color}
                    strokeWidth="2"
                    onPointerDown={event => {
                      event.stopPropagation();
                      setSelectedOpeningId(opening.id);
                      setSelectedWallId(null);
                      setSelectedNodeId(null);
                      setDragOpeningId(opening.id);
                    }}
                  />
                  {opening.type === 'door' ? <path d="M -5 6 A 10 10 0 0 1 5 -6" stroke={color} strokeWidth="1.5" fill="none" /> : <line x1="-6" x2="6" y1="0" y2="0" stroke={color} strokeWidth="2" />}
                </g>
              );
            })}
          </svg>

          {isGenerating && (
            <div className="absolute inset-0 bg-white/75 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <Loader2 className="animate-spin text-indigo-600" size={38} />
              <div className="text-sm font-black text-slate-800">Running local HouseDiffusion inference</div>
              {runtimeStatus?.state && (
                <div className="max-w-md rounded-xl bg-white/90 border border-slate-200 px-4 py-3 text-center shadow-sm">
                  <div className="text-[10px] font-black uppercase tracking-wider text-indigo-600">{runtimeStatus.state.replace(/_/g, ' ')}</div>
                  <div className="text-xs text-slate-600 mt-1">{runtimeStatus.message}</div>
                  {runtimeStatus.device && <div className="text-[10px] text-slate-400 mt-1">Device: {runtimeStatus.device}</div>}
                  {runtimeStatus.elapsedSeconds !== undefined && <div className="text-[10px] text-slate-400 mt-1">Elapsed: {runtimeStatus.elapsedSeconds}s</div>}
                  {runtimeStatus.processActive && <div className="text-[10px] font-black text-emerald-600 mt-1">Python process active</div>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 rounded-2xl border border-slate-200 bg-white p-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-black text-slate-800 flex items-center gap-2">
              {error ? <AlertCircle size={15} className="text-rose-600" /> : <MousePointer2 size={15} className="text-indigo-600" />}
              {error || status}
            </div>
            <div className="text-[10px] text-slate-400 mt-1 truncate">
              Prototype: {AUTO_PLAN_PROTOTYPE_PATH_DEFAULT}
            </div>
            {runtimeStatus && (
              <div className="mt-2 rounded-xl bg-slate-50 border border-slate-200 p-2 text-[10px] text-slate-600 leading-relaxed max-h-20 overflow-y-auto">
                <div><span className="font-black">State:</span> {runtimeStatus.state || 'unknown'}</div>
                <div><span className="font-black">Message:</span> {runtimeStatus.message || 'Waiting for backend status...'}</div>
                {runtimeStatus.updatedAt && <div><span className="font-black">Updated:</span> {runtimeStatus.updatedAt}</div>}
                {runtimeStatus.modelPath && <div className="truncate"><span className="font-black">Model:</span> {runtimeStatus.modelPath}</div>}
                {runtimeStatus.elapsedSeconds !== undefined && <div><span className="font-black">Elapsed:</span> {runtimeStatus.elapsedSeconds}s</div>}
                {runtimeStatus.processActive !== undefined && <div><span className="font-black">Python:</span> {runtimeStatus.processActive ? 'active' : 'inactive'}</div>}
                {runtimeStatus.heartbeatAt && <div><span className="font-black">Heartbeat:</span> {runtimeStatus.heartbeatAt}</div>}
              </div>
            )}
            {warnings.length > 0 && <div className="text-[10px] text-amber-700 mt-1 truncate">{warnings[0]}</div>}
          </div>
          <div className="flex items-center gap-2">
            {stage === 'nodes' && (
              <>
                <select value={addNodeType} onChange={event => setAddNodeType(event.target.value)} className="h-9 rounded-lg border border-slate-200 text-xs px-2">
                  {ROOM_SPACE_OPTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
                <button onClick={addOptionalNode} className={actionButtonClass}><Plus size={14} /> Node</button>
                <button onClick={deleteSelectedNode} disabled={!selectedNodeId} className={actionButtonClass}><Trash2 size={14} /> Node</button>
              </>
            )}
            {stage === 'walls' && (
              <>
                <button onClick={addWall} className={actionButtonClass}><Plus size={14} /> Wall</button>
                <button onClick={deleteSelectedWall} disabled={!selectedWallId} className={actionButtonClass}><Trash2 size={14} /> Wall</button>
              </>
            )}
            {stage === 'openings' && (
              <button onClick={deleteSelectedOpening} disabled={!selectedOpeningId} className={actionButtonClass}><Trash2 size={14} /> Opening</button>
            )}
            {stage !== 'setup' && <button onClick={handleBack} className={actionButtonClass}><ArrowLeft size={14} /> Back</button>}
            {stage !== 'setup' && stage !== 'import' && <button onClick={handleGenerate} className={actionButtonClass}><RefreshCw size={14} /> Regenerate</button>}
            {(stage === 'nodes' || stage === 'walls' || stage === 'openings') && <button onClick={handleApprove} className={primaryButtonClass}><Check size={15} /> Approve</button>}
            {stage === 'import' && <button onClick={handleImport} className={primaryButtonClass}><DoorOpen size={15} /> Import to Canvas</button>}
          </div>
        </div>
      </main>
    </div>
  );
};

const centroidForBoundary = (points: Point[]): Point => {
  if (!points.length) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
};

const SectionTitle = ({ title }: { title: string }) => (
  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{title}</div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{label}</span>
    {children}
  </label>
);

const Counter = ({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) => (
  <div className="rounded-xl bg-slate-50 border border-slate-200 p-2">
    <div className="text-[10px] font-black uppercase text-slate-400">{label}</div>
    <div className="flex items-center justify-between mt-1">
      <button onClick={() => onChange(Math.max(min, value - 1))} className="w-7 h-7 rounded-lg bg-white border border-slate-200 font-black">-</button>
      <span className="text-sm font-black text-slate-800">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} className="w-7 h-7 rounded-lg bg-white border border-slate-200 font-black">+</button>
    </div>
  </div>
);

export default AutoPlanPanel;
