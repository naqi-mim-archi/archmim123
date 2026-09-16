import React, { useRef } from 'react';
import { Project, Point } from '../types';
import { Map, Layers, Move, RotateCcw, ZoomIn, Eye, EyeOff, ChevronLeft, Trash2, Upload } from 'lucide-react';

interface SiteMapPanelProps {
  project: Project;
  onUpdateSiteMap: (updates: Partial<Project['siteMap']>) => void;
  onUploadMap: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isVisible: boolean;
  onToggleVisibility: () => void;
  onClose: () => void;
}

export const SiteMapPanel: React.FC<SiteMapPanelProps> = ({
  project,
  onUpdateSiteMap,
  onUploadMap,
  isVisible,
  onToggleVisibility,
  onClose
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sm = project.siteMap;

  // Render empty state if no URL
  if (!sm?.url) {
    return (
      <div className="absolute top-20 right-80 w-64 bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-40">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Map className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-800">Site Map</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-md transition-colors">
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="p-6 flex flex-col items-center text-center space-y-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
            <Upload className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">No Map Loaded</h4>
            <p className="text-xs text-slate-500 mt-1">Upload a site plan or map image to start tracing.</p>
          </div>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
          >
            Choose Image
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={onUploadMap}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute top-20 right-80 w-64 bg-white/90 backdrop-blur-md rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col z-40">
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Map className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-slate-800">Site Map Status</h3>
        </div>
        <button 
          onClick={onClose}
          className="p-1 hover:bg-slate-200 rounded-md transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Toggle Visibility */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600 uppercase tracking-wider">Visibility</span>
          <button 
            onClick={onToggleVisibility}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isVisible 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {isVisible ? 'Visible' : 'Hidden'}
          </button>
        </div>

        <div className="h-px bg-slate-100" />

        {/* Opacity Slider */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-slate-600">Opacity</span>
            <span className="text-[10px] font-mono text-slate-400">{(sm.opacity * 100).toFixed(0)}%</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.05" 
            value={sm.opacity}
            onChange={(e) => onUpdateSiteMap({ opacity: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>

        {/* Scale Input */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <ZoomIn className="w-3.5 h-3.5" />
            <span>Scale (Pixels per Meter)</span>
          </div>
          <div className="flex gap-2">
            <input 
              type="number" 
              value={sm.scale}
              onChange={(e) => onUpdateSiteMap({ scale: parseFloat(e.target.value) || 1 })}
              className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Rotation */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Rotation (Degrees)</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="360" 
            step="1" 
            value={sm.rotation}
            onChange={(e) => onUpdateSiteMap({ rotation: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>

        {/* Offset */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <Move className="w-3.5 h-3.5" />
            <span>Offset (Meters)</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase">X</label>
              <input 
                type="number" 
                value={sm.offset.x}
                onChange={(e) => onUpdateSiteMap({ offset: { ...sm.offset, x: parseFloat(e.target.value) || 0 } })}
                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase">Y</label>
              <input 
                type="number" 
                value={sm.offset.y}
                onChange={(e) => onUpdateSiteMap({ offset: { ...sm.offset, y: parseFloat(e.target.value) || 0 } })}
                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono"
              />
            </div>
          </div>
        </div>

        <div className="h-px bg-slate-100" />

        <button 
          onClick={() => onUpdateSiteMap({ url: '' })}
          className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove Map
        </button>
      </div>
    </div>
  );
};
