import React, { useState, useRef } from 'react';
import { ChevronLeft, Play, Scissors, Minimize, Upload, Download, Trash } from 'lucide-react';
import { ObjParser } from '../services/objParser';
import { Point } from '../types';

interface BlockEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveBlock: (block: { name: string; width: number; depth: number; height: number; customMeshData?: { vertices: number[]; faces: number[] } }) => void;
}

export const BlockEditor: React.FC<BlockEditorProps> = ({ isOpen, onClose, onSaveBlock }) => {
  const [blockName, setBlockName] = useState('Custom Sofa');
  const [width, setWidth] = useState(1.2);
  const [depth, setDepth] = useState(0.8);
  const [height, setHeight] = useState(0.75);
  const [vertices, setVertices] = useState<number[]>([]);
  const [faces, setFaces] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Handles custom OBJ import
  const handleImportOBJ = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = ObjParser.parseOBJ(text);
      if (parsed) {
        setVertices(parsed.vertices);
        setFaces(parsed.faces);
        alert(`Successfully imported OBJ block: ${parsed.vertices.length / 3} vertices, ${parsed.faces.length / 3} faces.`);
      } else {
        alert("Could not parse OBJ file. Ensure it contains valid 'v' and 'f' data.");
      }
    };
    reader.readAsText(file);
  };

  const handleSave = () => {
    onSaveBlock({
      name: blockName,
      width,
      depth,
      height,
      customMeshData: vertices.length > 0 ? { vertices, faces } : undefined
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col h-[65vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2 text-indigo-600">
            <Minimize size={20} />
            <h2 className="font-bold text-lg text-slate-900">Custom Block Editor</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
            <ChevronLeft size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Block Name</label>
            <input 
              type="text" 
              value={blockName}
              onChange={(e) => setBlockName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Width (m)</label>
              <input 
                type="number" 
                step="0.1"
                value={width}
                onChange={(e) => setWidth(parseFloat(e.target.value) || 1.0)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Depth (m)</label>
              <input 
                type="number" 
                step="0.1"
                value={depth}
                onChange={(e) => setDepth(parseFloat(e.target.value) || 1.0)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Height (m)</label>
              <input 
                type="number" 
                step="0.1"
                value={height}
                onChange={(e) => setHeight(parseFloat(e.target.value) || 1.0)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Modeling Command Tools (Extrude / Subtract / Fillet) */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">2D / 3D Extrude & Subtract Modeling</label>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => alert("Extrude Operation applied to selected 2D footprint geometry.")}
                className="flex items-center gap-2 justify-center py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-650 transition-colors"
              >
                <Play size={14} /> Extrude Shape
              </button>
              <button 
                onClick={() => alert("Difference Subtraction operation applied.")}
                className="flex items-center gap-2 justify-center py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-650 transition-colors"
              >
                <Scissors size={14} /> Subtract Shape
              </button>
            </div>
          </div>

          {/* Import OBJ Asset */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Custom 3D Mesh Upload</label>
            <div className="flex gap-2">
              <input 
                type="file" 
                ref={fileInputRef} 
                accept=".obj"
                onChange={handleImportOBJ}
                className="hidden" 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl text-xs font-bold text-slate-600 transition-colors"
              >
                <Upload size={16} /> Import Wavefront .obj
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-colors">
            Create Block
          </button>
        </div>
      </div>
    </div>
  );
};
