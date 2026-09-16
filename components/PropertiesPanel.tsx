import React, { useState, useEffect, useMemo } from 'react';
import { ArchElement, EditorState, Project, Point } from '../types';
import { 
  Settings, Hash, MoreVertical, ChevronDown, Layout, Sparkles, RefreshCw,
  Box, Type, Sliders, Layers, Bold, Italic, Underline, Maximize2, AlignLeft, Download
} from 'lucide-react';
import { formatDimension, parseDimension, generateRoomLabel } from '../App';
import { SPATIAL_PROGRAMS } from '../services/proceduralService';
import { 
  WALL_PRESETS, WALL_THICKNESS_DEFAULT, DOOR_PRESETS, WINDOW_PRESETS, 
  DEFAULT_PROJECT_SETTINGS_3D, COLUMN_PRESETS, FURNITURE_PRESETS, 
  FIXTURE_PRESETS, COUNTER_PRESETS, STAIR_PRESETS, 
  PROCEDURAL_TYPOLOGIES, PROCEDURAL_STYLES, PROCEDURAL_GEOMETRIES, inferInteriorSeatCount, normalizeInteriorSubType
} from '../constants';
import { BimService } from '../services/bimService';

const SHOW_AI_GEN_MENU = false;
const SHOW_MAIN_CANVAS_PROCEDURAL_ACTIONS = false;

interface TooltipProps {
  label: string;
  children: React.ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ label, children }) => (
  <div className="relative group">
    {children}
    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-[100]">
      {label}
    </div>
  </div>
);

// Unified Element Icon Helper component
const ElementIcon: React.FC<{ type: string; size?: number }> = ({ type, size = 15 }) => {
  switch (type) {
    case 'wall':
      return <Maximize2 size={size} className="text-slate-500" />;
    case 'door':
      return <RefreshCw size={size} className="text-slate-500" />;
    case 'window':
      return <Layout size={size} className="text-slate-500" />;
    case 'column':
      return <Box size={size} className="text-slate-500" />;
    case 'furniture':
      return <Layout size={size} className="text-slate-500" />;
    case 'fixture':
      return <Settings size={size} className="text-slate-500" />;
    case 'counter':
      return <Sliders size={size} className="text-slate-500" />;
    case 'stair':
      return <Layers size={size} className="text-slate-500" />;
    case 'room':
      return <Type size={size} className="text-slate-500" />;
    case 'dimension':
      return <Hash size={size} className="text-slate-500" />;
    case 'gridline':
      return <Sliders size={size} className="text-slate-500" />;
    case 'zone':
      return <Settings size={size} className="text-slate-500" />;
    case 'asset':
      return <Box size={size} className="text-slate-500" />;
    default:
      return <Settings size={size} className="text-slate-500" />;
  }
};

const getInteriorVisualType = (element: ArchElement): ArchElement['type'] => {
  const sub = (element.subType || '').toLowerCase();
  const furnitureLike = [
    'bed', 'sofa', 'chair', 'stool', 'ottoman', 'puff', 'table', 'desk', 'conference',
    'wardrobe', 'bedside', 'coffee', 'tv_console', 'filing', 'shelf', 'buffet',
    'credenza', 'whiteboard'
  ];
  const fixtureLike = ['wc', 'basin', 'vanity_basin', 'corner_basin', 'sink', 'double_sink', 'stove', 'hob', 'fridge', 'washer', 'bath', 'shower'];
  const counterLike = ['standard', 'island', 'counter', 'cashier', 'reception_curved', 'display_counter', 'service_counter', 'base_cabinet'];

  if (element.type === 'fixture' && furnitureLike.some(token => sub.includes(token))) return 'furniture';
  if (element.type === 'furniture' && fixtureLike.some(token => sub.includes(token))) return 'fixture';
  if ((element.type === 'fixture' || element.type === 'furniture') && counterLike.some(token => sub.includes(token))) return 'counter';
  return element.type;
};

interface PropertiesPanelProps {
  selectedElement: ArchElement | null;
  onUpdate: (element: ArchElement) => void;
  onUpdateProjectSettings3D: (settings3D: Project['settings3D']) => void;
  editorState: EditorState;
  setEditorState: React.Dispatch<React.SetStateAction<EditorState>>;
  project: Project;
  onRegenerateProcedural?: (hostId: string, boundaryPoints: Point[], config?: any) => void;
  onOpenProceduralWizard?: (hostId: string, boundary: Point[]) => void;
  onFurnishFloor?: (floorId: string) => void;
  onUpdateProjectLayers?: (layers: any[]) => void;
  setProject?: React.Dispatch<React.SetStateAction<Project | null>>;
  onOpenUrbanWizard?: () => void;
  onOpenGenerativeWizard?: () => void;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ 
  selectedElement, onUpdate, onUpdateProjectSettings3D, 
  editorState, setEditorState, project, onRegenerateProcedural, onOpenProceduralWizard,
  onFurnishFloor, onUpdateProjectLayers, setProject, onOpenUrbanWizard, onOpenGenerativeWizard
}) => {
  const [localThickness, setLocalThickness] = useState('');
  const [localWidth, setLocalWidth] = useState('');
  const [localDepth, setLocalDepth] = useState('');
  const [localDefaultLevelHeight, setLocalDefaultLevelHeight] = useState('');
  const [localSlab, setLocalSlab] = useState('');
  const [localDoorHeight, setLocalDoorHeight] = useState('');
  const [localWindowSillHeight, setLocalWindowSillHeight] = useState('');
  const [localWindowTopHeight, setLocalWindowTopHeight] = useState('');
  const [isAiDropdownOpen, setIsAiDropdownOpen] = useState(false);

  const proceduralHost = useMemo(() => {
    if (!selectedElement || !project?.elements) return null;
    if (selectedElement.isProceduralHost) return selectedElement;
    if (selectedElement.proceduralId) {
      return project.elements.find(el => el.isProceduralHost && el.proceduralId === selectedElement.proceduralId) || null;
    }
    return null;
  }, [selectedElement, project?.elements]);

  const underlayElement = useMemo(() => {
    if (!selectedElement || !project?.elements) return null;
    if (selectedElement.type === 'cad-underlay') return selectedElement;
    if (selectedElement.parentUnderlayId) {
      return project.elements.find(el => el.id === selectedElement.parentUnderlayId && el.type === 'cad-underlay') || null;
    }
  }, [selectedElement, project?.elements]);

  const [localHeight, setLocalHeight] = useState('');
  const [localElevation, setLocalElevation] = useState('');

  useEffect(() => {
    const settings = { ...DEFAULT_PROJECT_SETTINGS_3D, ...(project.settings3D || {}) };
    setLocalDefaultLevelHeight(formatDimension(settings.defaultLevelHeight, editorState.unitSystem));
    setLocalSlab(formatDimension(settings.slabThickness, editorState.unitSystem));
    setLocalDoorHeight(formatDimension(settings.doorHeight, editorState.unitSystem));
    setLocalWindowSillHeight(formatDimension(settings.windowSillHeight, editorState.unitSystem));
    setLocalWindowTopHeight(formatDimension(settings.windowTopHeight, editorState.unitSystem));

    if (selectedElement) {
      setLocalThickness(formatDimension(selectedElement.thickness || WALL_THICKNESS_DEFAULT, editorState.unitSystem));
      setLocalWidth(formatDimension(selectedElement.width || 1.0, editorState.unitSystem));
      setLocalDepth(formatDimension(selectedElement.depth || 1.0, editorState.unitSystem));
      setLocalHeight(formatDimension(selectedElement.height || 0.75, editorState.unitSystem));
      setLocalElevation(formatDimension(selectedElement.elevation || 0.0, editorState.unitSystem));
    }
  }, [selectedElement, editorState.unitSystem, project.settings3D]);

  const handleThicknessBlur = () => {
    if (!selectedElement) return;
    const val = parseDimension(localThickness, editorState.unitSystem);
    if (val !== null) onUpdate({ ...selectedElement, thickness: val });
    else setLocalThickness(formatDimension(selectedElement.thickness || WALL_THICKNESS_DEFAULT, editorState.unitSystem));
  };

  const handleThicknessPresetSelect = (val: number) => {
    if (!selectedElement) return;
    onUpdate({ ...selectedElement, thickness: val });
    setLocalThickness(formatDimension(val, editorState.unitSystem));
  };

  // Improved Preset Selection: Swaps entire object state
  const handleObjectPresetSelect = (preset: any) => {
    if (!selectedElement) return;
    
    const update: Partial<ArchElement> = {
        type: preset.type ?? selectedElement.type,
        width: preset.width,
        depth: preset.depth,
        height: preset.height ?? selectedElement.height,
        subType: preset.subType,
        label: preset.label === 'New Preset' ? selectedElement.label : preset.label,
        shape: preset.shape,
        seatsCount: preset.seatsCount,
        bedPillows: preset.bedPillows
    };
    
    onUpdate({ ...selectedElement, ...update });
    
    setLocalWidth(formatDimension(preset.width, editorState.unitSystem));
    if (preset.depth) setLocalDepth(formatDimension(preset.depth, editorState.unitSystem));
    if (preset.height) setLocalHeight(formatDimension(preset.height, editorState.unitSystem));
  };

  const handleWidthBlur = () => {
    if (!selectedElement) return;
    const val = parseDimension(localWidth, editorState.unitSystem);
    if (val !== null) onUpdate({ ...selectedElement, width: val });
    else setLocalWidth(formatDimension(selectedElement.width || 1.0, editorState.unitSystem));
  };

  const handleDepthBlur = () => {
    if (!selectedElement) return;
    const val = parseDimension(localDepth, editorState.unitSystem);
    if (val !== null) onUpdate({ ...selectedElement, depth: val });
    else setLocalDepth(formatDimension(selectedElement.depth || 1.0, editorState.unitSystem));
  };

  const handleHeightBlur = () => {
    if (!selectedElement) return;
    const val = parseDimension(localHeight, editorState.unitSystem);
    if (val !== null) onUpdate({ ...selectedElement, height: val });
    else setLocalHeight(formatDimension(selectedElement.height || 0.75, editorState.unitSystem));
  };

  const handleElevationBlur = () => {
    if (!selectedElement) return;
    const val = parseDimension(localElevation, editorState.unitSystem);
    if (val !== null) onUpdate({ ...selectedElement, elevation: val });
    else setLocalElevation(formatDimension(selectedElement.elevation || 0.0, editorState.unitSystem));
  };

  const handleDefaultLevelHeightBlur = () => {
    const settings = { ...DEFAULT_PROJECT_SETTINGS_3D, ...(project.settings3D || {}) };
    const val = parseDimension(localDefaultLevelHeight, editorState.unitSystem);
    if (val !== null) {
      onUpdateProjectSettings3D({ ...settings, defaultLevelHeight: val });
      // Update all floors heights
      if (setProject) {
        setProject(prev => {
           if (!prev) return prev;
           const sortedLevels = [...prev.levels].sort((a,b) => a.order - b.order);
           const slab = prev.settings3D?.slabThickness || 0.3;
           
           // Find the base level (e.g. order 0 or lowest positive)
           const baseIdx = sortedLevels.findIndex(l => l.order >= 0) || 0;
           let currentZ = sortedLevels[baseIdx]?.zElevation || 0;
           
           // Calculate upwards
           for (let i = baseIdx; i < sortedLevels.length; i++) {
               sortedLevels[i].zElevation = currentZ;
               sortedLevels[i].height = val;
               currentZ += val + slab;
           }
           
           // Calculate downwards
           currentZ = (sortedLevels[baseIdx]?.zElevation || 0) - val - slab;
           for (let i = baseIdx - 1; i >= 0; i--) {
               sortedLevels[i].zElevation = currentZ;
               sortedLevels[i].height = val;
               currentZ -= val + slab;
           }
           
           return {
               ...prev,
               levels: sortedLevels
           };
        });
      }
    } else {
      setLocalDefaultLevelHeight(formatDimension(settings.defaultLevelHeight, editorState.unitSystem));
    }
  };

  const handleDoorHeightBlur = () => {
    const settings = { ...DEFAULT_PROJECT_SETTINGS_3D, ...(project.settings3D || {}) };
    const val = parseDimension(localDoorHeight, editorState.unitSystem);
    if (val !== null) onUpdateProjectSettings3D({ ...settings, doorHeight: val });
    else setLocalDoorHeight(formatDimension(settings.doorHeight, editorState.unitSystem));
  };

  const handleWindowSillBlur = () => {
    const settings = { ...DEFAULT_PROJECT_SETTINGS_3D, ...(project.settings3D || {}) };
    const val = parseDimension(localWindowSillHeight, editorState.unitSystem);
    if (val !== null) onUpdateProjectSettings3D({ ...settings, windowSillHeight: val });
    else setLocalWindowSillHeight(formatDimension(settings.windowSillHeight, editorState.unitSystem));
  };

  const handleWindowTopBlur = () => {
    const settings = { ...DEFAULT_PROJECT_SETTINGS_3D, ...(project.settings3D || {}) };
    const val = parseDimension(localWindowTopHeight, editorState.unitSystem);
    if (val !== null) onUpdateProjectSettings3D({ ...settings, windowTopHeight: val });
    else setLocalWindowTopHeight(formatDimension(settings.windowTopHeight, editorState.unitSystem));
  };

  const handleAddLevelAbove = () => {
    if (!setProject || !project) return;
    const activeLevel = project.levels.find(l => l.id === editorState.activeLevelId) || project.levels[project.levels.length - 1];
    let sortedLevels = [...project.levels].sort((a, b) => a.order - b.order);
    const slab = project.settings3D?.slabThickness || 0.3;
    const newElevation = activeLevel.zElevation + activeLevel.height + slab;
    
    sortedLevels = sortedLevels.map(l => {
      if (l.order > activeLevel.order) return { ...l, order: l.order + 1, zElevation: l.zElevation + (project.settings3D?.defaultLevelHeight || 3.0) + slab };
      return l;
    });

    const newLevel = { id: crypto.randomUUID(), name: `Level ${sortedLevels.length + 1}`, zElevation: newElevation, height: project.settings3D?.defaultLevelHeight || 3.0, order: activeLevel.order + 1 };
    const newProject = { ...project, levels: [...sortedLevels, newLevel] };
    setProject(newProject);
    setEditorState(s => ({ ...s, activeLevelId: newLevel.id }));
  };

  const handleAddLevelBelow = () => {
    if (!setProject || !project) return;
    const activeLevel = project.levels.find(l => l.id === editorState.activeLevelId) || project.levels[0];
    let sortedLevels = [...project.levels].sort((a, b) => a.order - b.order);
    const slab = project.settings3D?.slabThickness || 0.3;
    const newHeight = project.settings3D?.defaultLevelHeight || 3.0;
    const newElevation = activeLevel.zElevation - newHeight - slab;
    
    sortedLevels = sortedLevels.map(l => {
      if (l.order < activeLevel.order) return { ...l, order: l.order - 1 };
      return l;
    });

    const newLevel = { id: crypto.randomUUID(), name: `Basement`, zElevation: newElevation, height: newHeight, order: activeLevel.order - 1 };
    const newProject = { ...project, levels: [...sortedLevels, newLevel] };
    setProject(newProject);
    setEditorState(s => ({ ...s, activeLevelId: newLevel.id }));
  };

  // Reusable styling tokens for unified layout
  const panelStyle = "relative bg-white/95 backdrop-blur shadow-lg shadow-slate-200/50 border border-slate-200 rounded-2xl p-4 w-72 flex flex-col flex-1 min-h-0 overflow-y-auto pointer-events-auto";
  const sectionHeaderClass = "text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 mt-4 first:mt-0 pb-1 border-b border-slate-100";
  const rowGridClass = "grid grid-cols-12 gap-2 items-center py-1";
  const labelClass = "col-span-4 text-[11px] font-medium text-slate-500 whitespace-nowrap";
  const inputContainerClass = "col-span-8";
  const inlineInputClass = "w-full px-2.5 py-1 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:bg-white rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold transition-all shadow-sm";
  const selectClass = "w-full px-2.5 py-1 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:bg-white rounded-lg text-xs font-bold text-slate-700 transition-all focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer shadow-sm";

  // Render when NO ELEMENT IS SELECTED (Simplified Project Settings)
  if (!selectedElement) {
    const isAutomationView = editorState.viewMode === '2D' && (editorState.drawingView || 'plan') === 'plan';
    return (
      <div className={panelStyle}>
        <div className="flex items-center gap-2 pb-4 border-b border-slate-100 text-slate-850">
        <Settings size={16} className="text-slate-500" />
        <div>
          <h3 className="text-xs font-black uppercase tracking-wide">Project Settings</h3>
          <p className="text-[9px] text-slate-400 font-medium">Workspace Defaults</p>
        </div>
      </div>

      <div className="py-4 space-y-4">
        {/* Global Tools Relocated from Top Bar */}
        <div className="flex items-center gap-2 relative">
          {SHOW_AI_GEN_MENU && <>
            <button
              onClick={() => {
                if (!isAutomationView) return;
                setIsAiDropdownOpen(!isAiDropdownOpen);
              }}
              disabled={!isAutomationView}
              className={`flex-1 py-2 text-xs font-bold rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 ${isAutomationView ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
              title={isAutomationView ? 'AI Generation Features' : 'AI generation is available in 2D Plan only'}
            >
              <Sparkles size={14} />
              AI Gen <ChevronDown size={12} />
            </button>

            {isAiDropdownOpen && isAutomationView && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 py-1">
                <button
                  className="w-full text-left px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2"
                  onClick={() => {
                    setIsAiDropdownOpen(false);
                    onOpenGenerativeWizard?.();
                  }}
                >
                  <Sparkles size={12} className="text-indigo-500" />
                  Floorplan Generation
                </button>
              </div>
            )}
          </>}

          <div className="flex flex-1 items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button onClick={() => setEditorState(s => ({ ...s, unitSystem: 'metric' }))} className={`flex-1 py-1 text-[10px] font-bold rounded transition-all ${editorState.unitSystem === 'metric' ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}>Metric</button>
            <button onClick={() => setEditorState(s => ({ ...s, unitSystem: 'imperial' }))} className={`flex-1 py-1 text-[10px] font-bold rounded transition-all ${editorState.unitSystem === 'imperial' ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}>Imperial</button>
          </div>
        </div>
          
          <div className={sectionHeaderClass}>Level Management</div>
          
          <div className="grid grid-cols-12 gap-2 mb-2 px-1">
             <div className="col-span-12 space-y-1">
               {[...project.levels].sort((a,b) => b.order - a.order).map(lvl => (
                 <button
                    key={lvl.id}
                    onClick={() => setEditorState(s => ({ ...s, activeLevelId: lvl.id }))}
                    className={`w-full px-2 py-1.5 text-left text-[10px] font-bold rounded-md flex justify-between items-center transition-all ${editorState.activeLevelId === lvl.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                 >
                    <span>{lvl.name}</span>
                    <span className="text-slate-400 font-medium">{formatDimension(lvl.zElevation, editorState.unitSystem)}</span>
                 </button>
               ))}
             </div>
          </div>
          
          <div className="grid grid-cols-12 gap-2">
            <button onClick={handleAddLevelAbove} className="col-span-6 px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-colors">
               <span>↑ Add Above</span>
            </button>
            <button onClick={handleAddLevelBelow} className="col-span-6 px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-colors">
               <span>↓ Add Below</span>
            </button>
          </div>

          <div className="grid grid-cols-12 gap-2 mt-4">
            <label className="col-span-8 text-[10px] font-medium text-slate-500 whitespace-nowrap pt-1">Show Level Above (Ghost)</label>
            <div className="col-span-4 flex justify-end">
               <input type="checkbox" checked={!!editorState.showLevelAbove} onChange={(e) => setEditorState(s => ({ ...s, showLevelAbove: e.target.checked }))} />
            </div>
          </div>
          <div className="grid grid-cols-12 gap-2">
            <label className="col-span-8 text-[10px] font-medium text-slate-500 whitespace-nowrap pt-1">Show Level Below (Ghost)</label>
            <div className="col-span-4 flex justify-end">
               <input type="checkbox" checked={!!editorState.showLevelBelow} onChange={(e) => setEditorState(s => ({ ...s, showLevelBelow: e.target.checked }))} />
            </div>
          </div>

          <div className={sectionHeaderClass}>Constraints & Heights</div>
          
          <div className={rowGridClass}>
            <label className={labelClass}>Default Level Ht.</label>
            <div className={inputContainerClass}>
              <input 
                type="text" 
                value={localDefaultLevelHeight}
                onChange={(e) => setLocalDefaultLevelHeight(e.target.value)}
                onBlur={handleDefaultLevelHeightBlur}
                className={inlineInputClass}
                placeholder="e.g. 3.0 m"
              />
              </div>
            </div>

            <div className={sectionHeaderClass}>Element Defaults</div>
            
            <div className={rowGridClass}>
              <label className={labelClass}>Door Top Ht.</label>
              <div className={inputContainerClass}>
                <input
                  type="text"
                  value={localDoorHeight}
                  onChange={(e) => setLocalDoorHeight(e.target.value)}
                  onBlur={handleDoorHeightBlur}
                  className={inlineInputClass}
                  placeholder="e.g. 7' 0&quot;"
                />
              </div>
            </div>

            <div className={rowGridClass}>
              <label className={labelClass}>Window Base Ht.</label>
              <div className={inputContainerClass}>
                <input
                  type="text"
                  value={localWindowSillHeight}
                  onChange={(e) => setLocalWindowSillHeight(e.target.value)}
                  onBlur={handleWindowSillBlur}
                  className={inlineInputClass}
                  placeholder="e.g. 3' 0&quot;"
                />
              </div>
            </div>

            <div className={rowGridClass}>
              <label className={labelClass}>Window Top Ht.</label>
              <div className={inputContainerClass}>
                <input
                  type="text"
                  value={localWindowTopHeight}
                  onChange={(e) => setLocalWindowTopHeight(e.target.value)}
                  onBlur={handleWindowTopBlur}
                  className={inlineInputClass}
                  placeholder="e.g. 7' 0&quot;"
                />
              </div>
            </div>
          </div>

        {/* Layer Manager Panel */}
        <div className="py-2 border-t border-slate-100 flex flex-col flex-1 overflow-hidden min-h-[160px] max-h-[220px]">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 pb-1 border-b border-slate-100 flex items-center gap-1.5">
            <Layers size={11} className="text-slate-400" />
            <span>Layer Manager</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {(project.layers || []).map((layer) => {
              const elementCount = project.elements.filter(e => e.layer === layer.name).length;
              return (
                <div key={layer.name} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/60 p-1 rounded-lg text-[10px] transition-all hover:bg-slate-100">
                  {/* Lock status toggle */}
                  <button
                    onClick={() => {
                      const nextLayers = (project.layers || []).map(l => l.name === layer.name ? { ...l, locked: !l.locked } : l);
                      onUpdateProjectLayers?.(nextLayers);
                    }}
                    className={`p-1 rounded text-xs transition-colors ${layer.locked ? 'text-amber-500 bg-amber-50 hover:bg-amber-100' : 'text-slate-400 hover:bg-slate-200'}`}
                    title={layer.locked ? "Unlock Layer" : "Lock Layer"}
                  >
                    {layer.locked ? '🔒' : '🔓'}
                  </button>

                  {/* Visibility status toggle */}
                  <button
                    onClick={() => {
                      const nextLayers = (project.layers || []).map(l => l.name === layer.name ? { ...l, visible: !l.visible } : l);
                      onUpdateProjectLayers?.(nextLayers);
                    }}
                    className={`p-1 rounded text-xs transition-colors ${layer.visible ? 'text-blue-500 bg-blue-50 hover:bg-blue-100' : 'text-slate-400 hover:bg-slate-200'}`}
                    title={layer.visible ? "Hide Layer" : "Show Layer"}
                  >
                    {layer.visible ? '👁️' : '🕶️'}
                  </button>

                  {/* Rename input (supports layer '0' renaming as well) */}
                  <input
                    type="text"
                    value={layer.name}
                    onChange={(e) => {
                      const newName = e.target.value;
                      if (!newName.trim() || project.layers?.some(l => l.name === newName)) return;
                      const oldName = layer.name;
                      const nextLayers = (project.layers || []).map(l => l.name === oldName ? { ...l, name: newName } : l);
                      onUpdateProjectLayers?.(nextLayers);
                    }}
                    className="flex-1 bg-transparent hover:bg-slate-200/50 focus:bg-white border-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5 text-xs font-bold text-slate-700 outline-none truncate"
                    placeholder="Layer name"
                  />

                  {/* Element Count badge */}
                  <span className="px-1 py-0.5 bg-slate-200 text-slate-500 rounded text-[9px] font-bold shrink-0">
                    {elementCount}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Model Integrity Stats Grid */}
        <div className="pt-4 border-t border-slate-100 mt-auto">
          <div className={sectionHeaderClass}>Model Integrity Stats</div>
          <div className="grid grid-cols-3 gap-2 text-center mt-2 pb-1">
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 shadow-sm">
              <div className="text-[9px] font-bold text-slate-400 uppercase">Walls</div>
              <div className="text-sm font-black text-slate-700 mt-0.5">
                {project.elements.filter(e => e.type === 'wall').length}
              </div>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 shadow-sm">
              <div className="text-[9px] font-bold text-slate-400 uppercase">Drafts</div>
              <div className="text-sm font-black text-slate-700 mt-0.5">
                {project.elements.filter(e => ['line', 'rectangle'].includes(e.type)).length}
              </div>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 shadow-sm">
              <div className="text-[9px] font-bold text-slate-400 uppercase">Units</div>
              <div className="text-xs font-black uppercase text-blue-600 mt-1">
                {editorState.unitSystem === 'metric' ? 'Metric' : 'Imperial'}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active element logic & preset options mapping
  const visualElementType = getInteriorVisualType(selectedElement);
  let rawPresets: any[] = [];
  if (visualElementType === 'door') rawPresets = DOOR_PRESETS;
  else if (visualElementType === 'window') {
     rawPresets = WINDOW_PRESETS.filter(p => !['bay', 'angled-bay', 'box-bay', 'curved-bay'].includes(p.subType || ''));
  }
  else if (visualElementType === 'column') rawPresets = COLUMN_PRESETS;
  else if (visualElementType === 'furniture') rawPresets = FURNITURE_PRESETS;
  else if (visualElementType === 'fixture') rawPresets = FIXTURE_PRESETS;
  else if (visualElementType === 'counter') rawPresets = COUNTER_PRESETS;
  else if (visualElementType === 'stair') rawPresets = STAIR_PRESETS;

  // Filter based on Category/Subtype for furniture/fixtures
  let filteredPresets = rawPresets;
  if (visualElementType === 'furniture') {
     const sub = normalizeInteriorSubType(selectedElement.subType, selectedElement.label, selectedElement.shape).toLowerCase();
     if (sub.includes('bed')) filteredPresets = rawPresets.filter(p => p.category === 'bed');
     else if (sub.includes('sofa')) filteredPresets = rawPresets.filter(p => p.category === 'sofa' || p.category === 'bed');
     else if (sub.includes('chair') || sub.includes('ottoman') || sub.includes('stool')) filteredPresets = rawPresets.filter(p => p.category === 'chair');
     else if (sub.includes('table')) filteredPresets = rawPresets.filter(p => p.category === 'table');
     else if (sub.includes('desk') || sub.includes('conference') || sub.includes('reception')) filteredPresets = rawPresets.filter(p => ['desk', 'office'].includes(p.category));
     else if (sub.includes('wardrobe') || sub.includes('shelf') || sub.includes('filing') || sub.includes('cabinet') || sub.includes('credenza') || sub.includes('console')) filteredPresets = rawPresets.filter(p => ['storage', 'display'].includes(p.category));
  }

  // Find exact active preset
  const canonicalSelectedSubType = normalizeInteriorSubType(selectedElement.subType, selectedElement.label, selectedElement.shape);
  const activePreset = filteredPresets.find(p => p.subType === canonicalSelectedSubType && p.width === selectedElement.width && p.depth === selectedElement.depth)
    || filteredPresets.find(p => p.subType === canonicalSelectedSubType)
    || { label: selectedElement.label || `Custom ${visualElementType}` };
  const hasWidth = ['door', 'window', 'wall-opening', 'column', 'furniture', 'fixture', 'counter', 'stair'].includes(visualElementType);
  const hasDepth = ['column', 'furniture', 'fixture', 'counter'].includes(visualElementType);

  return (
    <div className={`${panelStyle} animate-in slide-in-from-right-4`}>
      
      {/* Universal Ribbon Header & Revit-inspired Type Selector */}
      <div className="flex flex-col gap-2 pb-4 border-b border-slate-100 select-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center shadow-sm">
              <ElementIcon type={visualElementType} size={15} />
            </div>
            <div>
              <h3 className="text-xs font-black capitalize text-slate-800 tracking-wide">
                {visualElementType.replace('-', ' ')}
              </h3>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Properties & Materials</p>
            </div>
          </div>
          <Tooltip label="More Info">
            <MoreVertical size={16} className="text-slate-400 cursor-pointer hover:text-slate-600 transition-colors" />
          </Tooltip>
        </div>

        {/* Unified Top Selector Dropdown (Revit / Coohom Theme) */}
        {filteredPresets.length > 0 && (
          <div className="relative group/preset w-full mt-2">
            <button className="w-full flex items-center justify-between px-3 py-2 bg-slate-50/50 hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-705 transition-all shadow-sm">
              <span className="truncate pr-2">{activePreset.label}</span>
              <ChevronDown size={14} className="text-slate-405 shrink-0" />
            </button>
            <div className="absolute left-0 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-2xl opacity-0 invisible group-hover/preset:opacity-100 group-hover/preset:visible transition-all z-50 overflow-hidden max-h-52 overflow-y-auto">
              {filteredPresets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleObjectPresetSelect(p)}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-blue-50 border-b border-slate-50 last:border-0 transition-colors flex items-center justify-between"
                >
                  <span className="font-bold text-slate-800">{p.label}</span>
                  <span className="text-[9px] text-slate-400 font-mono">
                    {formatDimension(p.width, editorState.unitSystem)}
                    {p.depth ? ` x ${formatDimension(p.depth, editorState.unitSystem)}` : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Parameters Content Scroll Container */}
      <div className="space-y-4 overflow-y-auto py-3 pr-1 -mr-2 flex-1 scrollbar-thin">
        
        {/* Wall Geometry */}
        {selectedElement.type === 'wall' && (
          <div className="space-y-2">
            <div className={sectionHeaderClass}>Wall Parameters</div>
            <div className={rowGridClass}>
              <label className={labelClass}>Thickness</label>
              <div className={inputContainerClass}>
                <input 
                  type="text" 
                  value={localThickness} 
                  onChange={(e) => setLocalThickness(e.target.value)}
                  onBlur={handleThicknessBlur}
                  className={inlineInputClass} 
                />
              </div>
            </div>
          </div>
        )}

        {/* Elements with standard Dimensions */}
        {(hasWidth || hasDepth) && (
          <div className="space-y-2">
            <div className={sectionHeaderClass}>Geometry Constraints</div>
            {hasWidth && (
              <div className={rowGridClass}>
                <label className={labelClass}>Width</label>
                <div className={inputContainerClass}>
                  <input 
                    type="text" 
                    value={localWidth} 
                    onChange={(e) => setLocalWidth(e.target.value)}
                    onBlur={handleWidthBlur}
                    className={inlineInputClass} 
                  />
                </div>
              </div>
            )}
            {hasDepth && (
              <div className={rowGridClass}>
                <label className={labelClass}>Depth</label>
                <div className={inputContainerClass}>
                  <input 
                    type="text" 
                    value={localDepth} 
                    onChange={(e) => setLocalDepth(e.target.value)}
                    onBlur={handleDepthBlur}
                    className={inlineInputClass} 
                  />
                </div>
              </div>
            )}
            {['furniture', 'fixture', 'counter', 'column'].includes(selectedElement.type) && (
              <>
                <div className={rowGridClass}>
                  <label className={labelClass}>Height</label>
                  <div className={inputContainerClass}>
                    <input 
                      type="text" 
                      value={localHeight} 
                      onChange={(e) => setLocalHeight(e.target.value)}
                      onBlur={handleHeightBlur}
                      className={inlineInputClass} 
                    />
                  </div>
                </div>
                <div className={rowGridClass}>
                  <label className={labelClass}>Z Elevation</label>
                  <div className={inputContainerClass}>
                    <input 
                      type="text" 
                      value={localElevation} 
                      onChange={(e) => setLocalElevation(e.target.value)}
                      onBlur={handleElevationBlur}
                      className={inlineInputClass} 
                    />
                  </div>
                </div>
              </>
            )}
            {visualElementType === 'furniture' && ['sofa', 'table', 'dining', 'conference'].some(key => canonicalSelectedSubType.toLowerCase().includes(key)) && (
              <div className={rowGridClass}>
                <label className={labelClass}>Seats</label>
                <div className={inputContainerClass}>
                  <select 
                    value={selectedElement.seatsCount || inferInteriorSeatCount(selectedElement)}
                    onChange={(e) => onUpdate({ ...selectedElement, seatsCount: parseInt(e.target.value) })}
                    className={selectClass}
                  >
                    <option value="1">1 Seater</option>
                    <option value="2">2 Seater</option>
                    <option value="3">3 Seater</option>
                    <option value="4">4 Seater</option>
                    <option value="6">6 Seater</option>
                    <option value="8">8 Seater</option>
                    <option value="10">10 Seater</option>
                    <option value="12">12 Seater</option>
                  </select>
                </div>
              </div>
            )}
            
            {(selectedElement.isImportedAsset || selectedElement.sourceType === 'revit_import' || selectedElement.bimMetadata?.sourceType === 'revit_import') && (
              <div className="pt-3 border-t border-slate-100 mt-2 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">BIM Revit Family</span>
                <div className="text-xs text-slate-500 font-medium">
                  Version: <span className="text-slate-800 font-bold">{selectedElement.bimMetadata?.revitVersion || 'Unknown'}</span>
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  Class: <span className="text-slate-800 font-bold">{selectedElement.classname || selectedElement.bimMetadata?.classname || 'Imported Revit Asset'}</span>
                </div>
                {selectedElement.bimMetadata?.rawBmData ? (
                  <button
                    onClick={() => {
                      try {
                        const buffer = BimService.base64ToArrayBuffer(selectedElement.bimMetadata.rawBmData);
                        const blob = new Blob([buffer], { type: 'application/octet-stream' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = selectedElement.bimMetadata.fileName || 'family.rfa';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      } catch (err) {
                        alert('Failed to export Revit file.');
                      }
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-indigo-55 border border-indigo-100 text-indigo-750 font-bold rounded-xl text-xs transition-colors hover:bg-indigo-100"
                  >
                    <Download size={13} /> Export BIM (.rfa)
                  </button>
                ) : (
                  <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-500">
                    Original Revit binary not stored in browser catalog.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Zone Settings */}
        {selectedElement.type === 'zone' && (
          <div className="space-y-3">
            <div className={sectionHeaderClass}>Zoning & Density</div>

            {/* Primary Land-use */}
            <div className={rowGridClass}>
              <label className={labelClass}>Land-use</label>
              <div className={inputContainerClass}>
                <select 
                  value={selectedElement.zoneType || 'mixed'}
                  onChange={(e) => onUpdate({ ...selectedElement, zoneType: e.target.value as any })}
                  className={selectClass}
                >
                  <option value="residential">Residential</option>
                  <option value="office">Office / Commercial</option>
                  <option value="industrial">Industrial</option>
                  <option value="mixed">Mixed-use</option>
                  <option value="park">Open Space / Park</option>
                </select>
              </div>
            </div>

            {/* Density Target */}
            <div className={rowGridClass}>
              <label className={labelClass}>Density</label>
              <div className={inputContainerClass}>
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl">
                  {['low', 'medium', 'high'].map(d => (
                    <button 
                      key={d}
                      onClick={() => onUpdate({ ...selectedElement, preferDensity: d as any })}
                      className={`py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${
                        selectedElement.preferDensity === d ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-white/50'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Favored Typology */}
            <div className={rowGridClass}>
              <label className={labelClass}>Typology</label>
              <div className={inputContainerClass}>
                <select 
                  value={selectedElement.preferTypology || 'any'}
                  onChange={(e) => onUpdate({ ...selectedElement, preferTypology: e.target.value as any })}
                  className={selectClass}
                >
                  <option value="any">Auto (Contextual)</option>
                  <option value="perimeter">Perimeter Block</option>
                  <option value="tower">Tower / Point Block</option>
                  <option value="slab">Slab / Row House</option>
                </select>
              </div>
            </div>

            {/* Edit Boundary Button */}
            <div className="pt-2">
              <button 
                onClick={() => setEditorState(s => ({ 
                  ...s, 
                  editingBoundaryId: s.editingBoundaryId === selectedElement.id ? undefined : selectedElement.id 
                }))}
                className={`w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md ${
                  editorState.editingBoundaryId === selectedElement.id 
                  ? 'bg-blue-600 text-white shadow-blue-100' 
                  : 'bg-slate-900 text-white shadow-slate-100'
                }`}
              >
                <Layout size={12} />
                {editorState.editingBoundaryId === selectedElement.id ? 'Save Boundary' : 'Edit Boundary'}
              </button>
            </div>
          </div>
        )}

        {/* Asset Settings */}
        {selectedElement.type === 'asset' && (
          <div className="space-y-3">
            <div className={sectionHeaderClass}>Asset Settings</div>

            {/* Asset Type */}
            <div className={rowGridClass}>
              <label className={labelClass}>Type</label>
              <div className={inputContainerClass}>
                <select 
                  value={selectedElement.assetType || 'tree'}
                  onChange={(e) => onUpdate({ ...selectedElement, assetType: e.target.value as any })}
                  className={selectClass}
                >
                  <option value="tree">Tree</option>
                  <option value="streetlight">Streetlight</option>
                  <option value="bench">Bench</option>
                  <option value="car">Car</option>
                  <option value="people">People</option>
                </select>
              </div>
            </div>

            {/* Rotation */}
            <div className="space-y-1 bg-slate-50 rounded-xl p-2.5 border border-slate-100">
              <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
                <span>Rotation</span>
                <span className="font-mono text-blue-600">{selectedElement.rotation || 0}°</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="360" 
                step="1"
                value={selectedElement.rotation || 0}
                onChange={(e) => onUpdate({ ...selectedElement, rotation: parseFloat(e.target.value) })}
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            {/* Scale */}
            <div className="space-y-1 bg-slate-50 rounded-xl p-2.5 border border-slate-100">
              <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
                <span>Scale</span>
                <span className="font-mono text-blue-600">{(selectedElement.scale || 1.0).toFixed(1)}x</span>
              </div>
              <input 
                type="range" 
                min="0.2" 
                max="3" 
                step="0.05"
                value={selectedElement.scale || 1.0}
                onChange={(e) => onUpdate({ ...selectedElement, scale: parseFloat(e.target.value) })}
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>
          </div>
        )}

        {/* Procedural AI Blocks */}
        {SHOW_MAIN_CANVAS_PROCEDURAL_ACTIONS && proceduralHost && (proceduralHost.proceduralBoundary || proceduralHost.proceduralBoundaryPoints) && (
          <div className={`pt-2 space-y-2 p-3 rounded-xl border animate-in fade-in zoom-in-95 duration-300 ${
            proceduralHost.isAutoProceduralHost
              ? 'bg-blue-50/50 border-blue-200'
              : proceduralHost.isSmartProceduralHost 
              ? 'bg-amber-50/50 border-amber-200' 
              : 'bg-blue-50/50 border-blue-100'
          }`}>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={14} className={proceduralHost.isAutoProceduralHost ? 'text-blue-500' : proceduralHost.isSmartProceduralHost ? 'text-blue-500 animate-pulse' : 'text-blue-500'} />
              <span className={`text-[10px] font-bold uppercase tracking-wider ${
                proceduralHost.isAutoProceduralHost ? 'text-blue-700' : proceduralHost.isSmartProceduralHost ? 'text-blue-700' : 'text-blue-600'
              }`}>
                {proceduralHost.isAutoProceduralHost ? 'Auto Procedural Area' : proceduralHost.isSmartProceduralHost ? 'Smart Procedural Area' : 'Procedural Area'}
              </span>
            </div>
            
            <button 
              onClick={() => {
                if (onOpenProceduralWizard && proceduralHost.proceduralBoundaryPoints) {
                  onOpenProceduralWizard(proceduralHost.id, proceduralHost.proceduralBoundaryPoints);
                }
              }}
              className={`w-full py-2 text-white rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 ${
                proceduralHost.isAutoProceduralHost
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : proceduralHost.isSmartProceduralHost
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <RefreshCw size={12} />
              {proceduralHost.isAutoProceduralHost ? 'Open Auto Procedural' : proceduralHost.isSmartProceduralHost ? 'Open Smart Procedural' : 'Open Procedural Architect'}
            </button>

            {onFurnishFloor && (
              <button 
                onClick={() => {
                  onFurnishFloor(proceduralHost.id);
                }}
                className={`w-full py-2 text-white rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 animate-in fade-in slide-in-from-top-2 duration-300 ${
                  proceduralHost.isSmartProceduralHost
                    ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700'
                    : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600'
                }`}
              >
                <Sparkles size={12} />
                {proceduralHost.isSmartProceduralHost ? 'Furnish Smart Floorplan' : 'Furnish Floorplan'}
              </button>
            )}
          </div>
        )}

        {/* Floor and Ceiling Boundary Editing */}
        {(selectedElement.type === 'floor' || selectedElement.type === 'ceiling') && (
          <div className="pt-2 space-y-2">
            <button 
              onClick={() => setEditorState(s => ({ 
                ...s, 
                editingBoundaryId: s.editingBoundaryId === selectedElement.id ? undefined : selectedElement.id 
              }))}
              className={`w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm ${
                editorState.editingBoundaryId === selectedElement.id
                ? 'bg-blue-600 text-white hover:bg-blue-700 ring-2 ring-blue-500 ring-offset-2'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Layout size={12} />
              {editorState.editingBoundaryId === selectedElement.id ? 'Save Boundary' : 'Edit Boundary'}
            </button>

            {SHOW_MAIN_CANVAS_PROCEDURAL_ACTIONS && selectedElement.type === 'floor' && onFurnishFloor && (
              <button 
                onClick={() => {
                  onFurnishFloor(selectedElement.id);
                }}
                className="w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white flex items-center justify-center gap-2 shadow-sm active:scale-95 animate-in fade-in slide-in-from-top-2 duration-300"
              >
                <Sparkles size={12} />
                Furnish Floorplan
              </button>
            )}

            {selectedElement.type === 'floor' && !selectedElement.isProceduralHost && selectedElement.boundary && selectedElement.boundary.length >= 3 && (
              <button 
                onClick={() => {
                  if (onOpenProceduralWizard) {
                    onOpenProceduralWizard(selectedElement.id, selectedElement.boundary!);
                  }
                }}
                className="w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white flex items-center justify-center gap-2 shadow-sm active:scale-95 animate-in fade-in slide-in-from-top-2 duration-300"
              >
                <Sparkles size={12} />
                Convert to Procedural
              </button>
            )}
          </div>
        )}

        {/* Grid Line parameters */}
        {selectedElement.type === 'gridline' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 pt-2">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl space-y-3">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Grid Line Properties</h4>
              <div className={rowGridClass}>
                <label className={labelClass}>Bubble Label</label>
                <div className={inputContainerClass}>
                  <input 
                    type="text"
                    value={selectedElement.label || ''}
                    onChange={(e) => {
                      onUpdate({
                        ...selectedElement,
                        label: e.target.value
                      });
                    }}
                    placeholder="e.g. A, 1, B-1"
                    className={inlineInputClass}
                  />
                </div>
              </div>
              <div className="text-[10px] text-slate-400 font-medium leading-relaxed bg-white p-2 text-center rounded-lg border border-slate-100">
                Grids number consecutively based on direction.
              </div>
            </div>
          </div>
        )}

        {/* Room Typography and Layout Options */}
        {selectedElement.type === 'room' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 pt-1">
            <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-2xl space-y-3">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Classification</h4>
              
              <div className={rowGridClass}>
                <label className={labelClass}>Space Name</label>
                <div className={inputContainerClass}>
                  <input 
                    type="text"
                    value={(selectedElement.label || '').split('\n')[0] || ''}
                    onChange={(e) => {
                      const newName = e.target.value;
                      const w = selectedElement.customRoomWidth ?? selectedElement.width ?? 5.3;
                      const d = selectedElement.customRoomDepth ?? selectedElement.depth ?? 6.0;
                      const labelText = generateRoomLabel(newName, w, d, editorState.unitSystem, !!selectedElement.roomNameOnly, !!selectedElement.roomShowArea);
                      onUpdate({
                        ...selectedElement,
                        label: labelText
                      });
                    }}
                    placeholder="e.g. LIVING DISTRIBUTOR"
                    className={inlineInputClass}
                  />
                </div>
              </div>

              {/* Toggle detailed dimensions */}
              <div className="flex items-center justify-between border-b border-dashed border-slate-100 pb-1 pt-1">
                <span className="text-[11px] font-medium text-slate-500">Show Dimensions</span>
                <button
                  type="button"
                  onClick={() => {
                    const showDims = selectedElement.roomNameOnly;
                    const lines = (selectedElement.label || '').split('\n');
                    const name = lines[0] || 'SPACE NAME';
                    const w = selectedElement.customRoomWidth ?? selectedElement.width ?? 5.3;
                    const d = selectedElement.customRoomDepth ?? selectedElement.depth ?? 6.0;
                    const labelText = generateRoomLabel(name, w, d, editorState.unitSystem, !showDims, !!selectedElement.roomShowArea);
                    onUpdate({
                      ...selectedElement,
                      roomNameOnly: !showDims,
                      label: labelText
                    });
                  }}
                  className={`w-8 h-4.5 rounded-full transition-colors relative ${!selectedElement.roomNameOnly ? 'bg-blue-600' : 'bg-slate-200'}`}
                >
                  <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all shadow-sm ${!selectedElement.roomNameOnly ? 'left-4' : 'left-0.5'}`} />
                </button>
              </div>

              {/* Toggle area */}
              <div className="flex items-center justify-between border-b border-dashed border-slate-100 pb-1 pt-1">
                <span className="text-[11px] font-medium text-slate-500">Show Area</span>
                <button
                  type="button"
                  onClick={() => {
                    const showArea = !selectedElement.roomShowArea;
                    const lines = (selectedElement.label || '').split('\n');
                    const name = lines[0] || 'SPACE NAME';
                    const w = selectedElement.customRoomWidth ?? selectedElement.width ?? 5.3;
                    const d = selectedElement.customRoomDepth ?? selectedElement.depth ?? 6.0;
                    const labelText = generateRoomLabel(name, w, d, editorState.unitSystem, !!selectedElement.roomNameOnly, showArea);
                    onUpdate({
                      ...selectedElement,
                      roomShowArea: showArea,
                      label: labelText
                    });
                  }}
                  className={`w-8 h-4.5 rounded-full transition-colors relative ${selectedElement.roomShowArea ? 'bg-blue-600' : 'bg-slate-200'}`}
                >
                  <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all shadow-sm ${selectedElement.roomShowArea ? 'left-4' : 'left-0.5'}`} />
                </button>
              </div>

              {/* Optional Room boundaries dimensions overrides overlay */}
              {!selectedElement.roomNameOnly && (
                <div className="space-y-2 pt-1 animate-in slide-in-from-top-1 duration-150">
                  <div className={rowGridClass}>
                    <label className={labelClass}>Width</label>
                    <div className={inputContainerClass}>
                      <input 
                        type="number"
                        step="0.1"
                        value={selectedElement.customRoomWidth ?? selectedElement.width ?? 5.3}
                        onChange={(e) => {
                          const w = parseFloat(e.target.value) || 0;
                          const d = selectedElement.customRoomDepth ?? selectedElement.depth ?? 6.0;
                          const lines = (selectedElement.label || '').split('\n');
                          const name = lines[0] || 'SPACE NAME';
                          const labelText = generateRoomLabel(name, w, d, editorState.unitSystem, !!selectedElement.roomNameOnly, !!selectedElement.roomShowArea);
                          onUpdate({
                            ...selectedElement,
                            customRoomWidth: w,
                            width: w,
                            label: labelText
                          });
                        }}
                        className={inlineInputClass}
                      />
                    </div>
                  </div>
                  <div className={rowGridClass}>
                    <label className={labelClass}>Length</label>
                    <div className={inputContainerClass}>
                      <input 
                        type="number"
                        step="0.1"
                        value={selectedElement.customRoomDepth ?? selectedElement.depth ?? 6.0}
                        onChange={(e) => {
                          const d = parseFloat(e.target.value) || 0;
                          const w = selectedElement.customRoomWidth ?? selectedElement.width ?? 5.3;
                          const lines = (selectedElement.label || '').split('\n');
                          const name = lines[0] || 'SPACE NAME';
                          const labelText = generateRoomLabel(name, w, d, editorState.unitSystem, !!selectedElement.roomNameOnly, !!selectedElement.roomShowArea);
                          onUpdate({
                            ...selectedElement,
                            customRoomDepth: d,
                            depth: d,
                            label: labelText
                          });
                        }}
                        className={inlineInputClass}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Typography styles & visual formatting properties */}
            <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-2xl space-y-3">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Typography</h4>
              
              <div className={rowGridClass}>
                <label className={labelClass}>Font Family</label>
                <div className={inputContainerClass}>
                  <select
                    value={selectedElement.textFontFamily || 'Inter'}
                    onChange={(e) => onUpdate({ ...selectedElement, textFontFamily: e.target.value })}
                    className={selectClass}
                  >
                    <option value="Inter">Inter (Sans-serif)</option>
                    <option value="Space Grotesk">Space Grotesk</option>
                    <option value='"JetBrains Mono", monospace'>JetBrains Mono</option>
                    <option value="Georgia, serif">Georgia (Serif)</option>
                    <option value='"Courier New", monospace'>Courier New (CAD)</option>
                  </select>
                </div>
              </div>

              <div className={rowGridClass}>
                <label className={labelClass}>Size & Color</label>
                <div className={`${inputContainerClass} flex gap-2 items-center`}>
                  <input 
                    type="number"
                    min="5"
                    max="48"
                    value={selectedElement.textFontSize || 12}
                    onChange={(e) => onUpdate({ ...selectedElement, textFontSize: parseInt(e.target.value) || 12 })}
                    className={`${inlineInputClass} !w-16`}
                  />
                  <div className="flex gap-1.5 items-center flex-1">
                    <input 
                      type="color"
                      value={selectedElement.color || '#1e293b'}
                      onChange={(e) => onUpdate({ ...selectedElement, color: e.target.value })}
                      className="w-6 h-6 p-0 border border-slate-200 rounded-lg bg-white cursor-pointer overflow-hidden"
                    />
                    <input 
                      type="text"
                      value={selectedElement.color || '#1e293b'}
                      onChange={(e) => onUpdate({ ...selectedElement, color: e.target.value })}
                      className="w-full px-1.5 py-1 bg-white border border-slate-200 rounded-lg text-[9px] font-mono select-all focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Alignment Selector */}
              <div className={rowGridClass}>
                <label className={labelClass}>Alignment</label>
                <div className={`${inputContainerClass} flex rounded-lg shadow-sm border border-slate-200 bg-white p-0.5 overflow-hidden`}>
                  {(['left', 'center', 'right'] as const).map((align) => (
                    <button
                      key={align}
                      type="button"
                      onClick={() => onUpdate({ ...selectedElement, textAlignment: align })}
                      className={`flex-1 py-1 text-[10px] capitalize transition-all rounded-md ${ (selectedElement.textAlignment || 'center') === align ? 'bg-slate-900 font-bold text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                      {align}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bold, Italic, Underline formatting bar */}
              <div className={rowGridClass}>
                <label className={labelClass}>Formatting</label>
                <div className={`${inputContainerClass} flex gap-1`}>
                  <button
                    type="button"
                    onClick={() => onUpdate({ ...selectedElement, textBold: !(selectedElement.textBold ?? true) })}
                    className={`flex-1 py-1 text-center text-xs font-black rounded-lg border transition-all ${ (selectedElement.textBold ?? true) ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-100' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdate({ ...selectedElement, textItalic: !selectedElement.textItalic })}
                    className={`flex-1 py-1 text-center text-xs font-black italic rounded-lg border transition-all ${selectedElement.textItalic ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-100' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    I
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdate({ ...selectedElement, textUnderline: !selectedElement.textUnderline })}
                    className={`flex-1 py-1 text-center text-xs font-black underline rounded-lg border transition-all ${selectedElement.textUnderline ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-100' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    U
                  </button>
                </div>
              </div>
            </div>

            {/* RAW Overrides label */}
            <div className="space-y-1.5 bg-slate-50 border border-slate-100 rounded-2xl p-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase flex justify-between">
                <span>Label Override</span>
              </label>
              <textarea
                value={selectedElement.label || ''}
                onChange={(e) => {
                  onUpdate({
                    ...selectedElement,
                    label: e.target.value
                  });
                }}
                rows={2}
                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 leading-tight"
                placeholder="SPACE NAME"
              />
            </div>
          </div>
        )}

        {/* Dimension Style & Precision Parameters */}
        {selectedElement.type === 'dimension' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 pt-1">
            <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-2xl space-y-3">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dimension Style</h4>
              
              {/* Line thickness slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-medium text-slate-500">
                  <span>Line Weight</span>
                  <span className="font-mono text-[10px] text-slate-400">{selectedElement.dimensionLineThickness || 1} px</span>
                </div>
                <input 
                  type="range"
                  min="1"
                  max="5"
                  step="0.5"
                  value={selectedElement.dimensionLineThickness || 1}
                  onChange={(e) => onUpdate({ ...selectedElement, dimensionLineThickness: parseFloat(e.target.value) || 1 })}
                  className="w-full accent-blue-600 cursor-ew-resize"
                />
              </div>

              {/* Line Color setting */}
              <div className={rowGridClass}>
                <label className={labelClass}>Line Color</label>
                <div className={`${inputContainerClass} flex gap-2`}>
                  <input 
                    type="color"
                    value={selectedElement.dimensionColor || '#334155'}
                    onChange={(e) => onUpdate({ ...selectedElement, dimensionColor: e.target.value, color: e.target.value })}
                    className="w-7 h-7 p-0 border border-slate-200 rounded-lg bg-white cursor-pointer shrink-0"
                  />
                  <input 
                    type="text"
                    value={selectedElement.dimensionColor || '#334155'}
                    onChange={(e) => onUpdate({ ...selectedElement, dimensionColor: e.target.value, color: e.target.value })}
                    className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono select-all focus:outline-none"
                  />
                </div>
              </div>

              {/* Measurement precision dropdown */}
              <div className={rowGridClass}>
                <label className={labelClass}>Precision</label>
                <div className={inputContainerClass}>
                  <select
                    value={selectedElement.dimensionPrecision ?? 2}
                    onChange={(e) => onUpdate({ ...selectedElement, dimensionPrecision: parseInt(e.target.value) })}
                    className={selectClass}
                  >
                    <option value="0">0 decimals (e.g. 5 m)</option>
                    <option value="1">1 decimal (e.g. 5.3 m)</option>
                    <option value="2">2 decimals (e.g. 5.31 m)</option>
                    <option value="3">3 decimals (e.g. 5.312 m)</option>
                  </select>
                </div>
              </div>

              {/* Show extension lines switch */}
              <div className="flex items-center justify-between border-b border-dashed border-slate-100 pb-1 pt-1">
                <span className="text-[11px] font-medium text-slate-500">Draw Extension Lines</span>
                <button
                  type="button"
                  onClick={() => {
                    const ext = selectedElement.dimensionShowExtension ?? true;
                    onUpdate({
                      ...selectedElement,
                      dimensionShowExtension: !ext
                    });
                  }}
                  className={`w-8 h-4.5 rounded-full transition-colors relative ${ (selectedElement.dimensionShowExtension ?? true) ? 'bg-blue-600' : 'bg-slate-200'}`}
                >
                  <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all shadow-sm ${ (selectedElement.dimensionShowExtension ?? true) ? 'left-4' : 'left-0.5'}`} />
                </button>
              </div>
            </div>

            {/* Typography configuration for dimension labels */}
            <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-2xl space-y-3">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dimension Label Font</h4>
              
              <div className={rowGridClass}>
                <label className={labelClass}>Font family</label>
                <div className={inputContainerClass}>
                  <select
                    value={selectedElement.textFontFamily || '"JetBrains Mono", monospace'}
                    onChange={(e) => onUpdate({ ...selectedElement, textFontFamily: e.target.value })}
                    className={selectClass}
                  >
                    <option value='"JetBrains Mono", monospace'>Fira/JetBrains Mono</option>
                    <option value="Inter">Inter (Sans-serif)</option>
                    <option value="Space Grotesk">Space Grotesk</option>
                    <option value='"Courier New", monospace'>Courier New (CAD style)</option>
                  </select>
                </div>
              </div>

              <div className={rowGridClass}>
                <label className={labelClass}>Text Size</label>
                <div className={`${inputContainerClass} flex gap-2 items-center`}>
                  <input 
                    type="number"
                    min="5"
                    max="30"
                    value={selectedElement.textFontSize || 9}
                    onChange={(e) => onUpdate({ ...selectedElement, textFontSize: parseInt(e.target.value) || 9 })}
                    className={`${inlineInputClass} !w-20`}
                  />
                  <div className="flex gap-1 flex-1">
                    <button
                      type="button"
                      onClick={() => onUpdate({ ...selectedElement, textBold: !(selectedElement.textBold ?? true) })}
                      className={`flex-1 py-1 text-center text-xs font-black rounded-lg border transition-all ${ (selectedElement.textBold ?? true) ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      title="Bold"
                    >
                      B
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdate({ ...selectedElement, textItalic: !selectedElement.textItalic })}
                      className={`flex-1 py-1 text-center text-xs font-black italic rounded-lg border transition-all ${selectedElement.textItalic ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      title="Italic"
                    >
                      I
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {underlayElement && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
                    <Box size={16} />
                  </div>
                  <div className="truncate max-w-[150px]">
                    <h4 className="text-xs font-bold text-slate-800 truncate">{underlayElement.label || "CAD Underlay"}</h4>
                    <p className="text-[10px] text-slate-450 font-medium">CAD Base Reference</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onUpdate({ ...underlayElement, locked: !underlayElement.locked });
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer ${
                    underlayElement.locked
                      ? 'bg-amber-50 border-amber-250 text-amber-700'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <span>{underlayElement.locked ? '🔒 Locked' : '🔓 Unlocked'}</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                {underlayElement.locked
                  ? "This reference underlay is locked. Unlock it from the toggle above to move, rotate, copy, or delete it."
                  : "This reference underlay is unlocked. You can move, rotate, copy, or delete it on the canvas."}
              </p>

              <div className="flex flex-col gap-2.5 w-full pt-1">
                {!underlayElement.converted2d ? (
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('smart-convert-cad', { detail: { id: underlayElement.id, mode: '2d' } }));
                    }}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all border border-slate-250 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles size={12} className="text-slate-500" />
                    <span>Smart Convert 2D</span>
                  </button>
                ) : (
                  <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-250">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">3D RECONSTRUCTION OPTIONS</p>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('smart-convert-cad', { detail: { id: underlayElement.id, mode: '3d-script' } }));
                        }}
                        className="w-full py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition-all border border-slate-300 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Box size={12} className="text-slate-500" />
                        <span>Smart 3D Convert (Script)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('smart-convert-cad', { detail: { id: underlayElement.id, mode: '3d-ai' } }));
                        }}
                        className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-all shadow active:scale-98 flex items-center justify-center gap-1.5 cursor-pointer border border-amber-600 animate-pulse"
                      >
                        <Sparkles size={12} />
                        <span>AI Floorplan Convert (Gemini)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}


      </div>
    </div>
  );
};

export default PropertiesPanel;
