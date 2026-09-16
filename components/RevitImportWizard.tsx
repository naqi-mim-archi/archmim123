import React, { useState, useRef } from 'react';
import { ChevronLeft, Upload, FileText, CheckCircle, AlertTriangle, Download, Database, Layers } from 'lucide-react';
import { BimService, BimMetadata } from '../services/bimService';
import { ObjParser } from '../services/objParser';

interface RevitImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadToInventory: (asset: {
    name: string;
    width: number;
    depth: number;
    height: number;
    category: string;
    customMeshData?: { vertices: number[]; faces: number[] };
    bimMetadata: BimMetadata;
  }) => void;
  onLoadProjectLayout: (projectData: {
    fileName: string;
    elements: any[];
    metadata: BimMetadata;
  }) => void;
}

export const RevitImportWizard: React.FC<RevitImportWizardProps> = ({
  isOpen,
  onClose,
  onLoadToInventory,
  onLoadProjectLayout
}) => {
  const [activeDivision, setActiveDivision] = useState<'asset' | 'project'>('asset');
  
  // File States
  const [revitFile, setRevitFile] = useState<File | null>(null);
  const [companionFile, setCompanionFile] = useState<File | null>(null);
  
  // Parsed States
  const [metadata, setMetadata] = useState<BimMetadata | null>(null);
  const [objMesh, setObjMesh] = useState<{ vertices: number[]; faces: number[] } | null>(null);
  const [meshReport, setMeshReport] = useState<{ verticesCount: number; facesCount: number; isWithinBudget: boolean; warningMessage?: string } | null>(null);

  // Asset Metadata overrides
  const [assetName, setAssetName] = useState('');
  const [width, setWidth] = useState(1.2);
  const [depth, setDepth] = useState(0.8);
  const [height, setHeight] = useState(0.75);
  const [category, setCategory] = useState('Seating');
  const [description, setDescription] = useState('Imported Revit Family Object');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const objInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleRevitUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRevitFile(file);
    const size = file.size;
    const type = file.name.toUpperCase().endsWith('.RFA') ? 'RFA' : 'RVT';

    const reader = new FileReader();
    reader.onload = async (event) => {
      const arrayBuffer = event.target?.result as ArrayBuffer;

      // Extract OLE embedded thumbnail
      const previewUrl = BimService.extractPngPreview(arrayBuffer) || undefined;

      // Parse Revit Version
      const revitVersion = BimService.parseRevitBuildVersion(arrayBuffer);

      // Convert raw binary to base64 to store as BIM data
      const rawBmData = BimService.arrayBufferToBase64(arrayBuffer);
      const displayName = file.name.replace(/\.[^/.]+$/, "");
      const baseClassName = BimService.sanitizeImportedClassName(file.name);

      const detectedMeta: BimMetadata = {
        fileName: file.name,
        fileSize: size,
        type,
        category: type === 'RFA' ? 'Furniture' : 'Project',
        description: `BIM model imported from ${file.name}`,
        revitVersion,
        rawBmData,
        previewUrl,
        sourceType: 'revit_import',
        sourceFileType: type.toLowerCase() as 'rfa' | 'rvt',
        sourceFileName: file.name,
        revitFamilyName: displayName,
        revitTypeName: displayName,
        classname: baseClassName,
        displayName,
        isImportedAsset: true,
        nativeCatalogAsset: false,
        thumbnail: previewUrl
      };

      setMetadata(detectedMeta);
      setAssetName(displayName);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleCompanionUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCompanionFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = ObjParser.parseOBJ(text);
      if (parsed) {
        setObjMesh({ vertices: parsed.vertices, faces: parsed.faces });
        const report = BimService.validateMeshBudget(text);
        setMeshReport(report);
      } else {
        alert("Failed to parse companion OBJ mesh. Make sure it contains valid vertices and faces.");
      }
    };
    reader.readAsText(file);
  };

  const handleSaveToInventory = () => {
    if (!metadata) return;
    const baseClassName = BimService.sanitizeImportedClassName(metadata.fileName || assetName);
    const importedMetadata = BimService.createImportedAssetMetadata({
      fileName: metadata.fileName,
      fileSize: metadata.fileSize,
      fileType: metadata.type,
      displayName: assetName || metadata.displayName || metadata.revitFamilyName || baseClassName,
      classname: metadata.classname || baseClassName,
      userCategory: category,
      width,
      depth,
      height,
      revitVersion: metadata.revitVersion,
      rawBmData: metadata.rawBmData,
      previewUrl: metadata.previewUrl,
      customMeshData: objMesh || undefined,
      description,
    });
    
    onLoadToInventory({
      name: assetName,
      width,
      depth,
      height,
      category,
      customMeshData: objMesh || undefined,
      bimMetadata: importedMetadata
    });

    // Reset state
    handleReset();
    onClose();
  };

  const handleImportProjectLayout = () => {
    if (!metadata) return;

    // Simulate/generate simple floorplan elements representing the RVT project outline
    // In production, this can map RVT elements to ArchElements
    const simulatedElements = [
      {
        id: crypto.randomUUID(),
        type: 'wall',
        p1: { x: -5, y: -5 },
        p2: { x: 5, y: -5 },
        thickness: 0.23,
        height: 3
      },
      {
        id: crypto.randomUUID(),
        type: 'wall',
        p1: { x: 5, y: -5 },
        p2: { x: 5, y: 5 },
        thickness: 0.23,
        height: 3
      },
      {
        id: crypto.randomUUID(),
        type: 'wall',
        p1: { x: 5, y: 5 },
        p2: { x: -5, y: 5 },
        thickness: 0.23,
        height: 3
      },
      {
        id: crypto.randomUUID(),
        type: 'wall',
        p1: { x: -5, y: 5 },
        p2: { x: -5, y: -5 },
        thickness: 0.23,
        height: 3
      }
    ];

    onLoadProjectLayout({
      fileName: metadata.fileName,
      elements: simulatedElements,
      metadata
    });

    handleReset();
    onClose();
  };

  const handleReset = () => {
    setRevitFile(null);
    setCompanionFile(null);
    setMetadata(null);
    setObjMesh(null);
    setMeshReport(null);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[150] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col my-8 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2 text-indigo-650">
            <Database size={22} />
            <h2 className="font-extrabold text-xl text-slate-900">BIM Revit Importer Tool</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors">
            <ChevronLeft size={20} />
          </button>
        </div>

        {/* Division Selector */}
        <div className="bg-slate-50 p-2 flex border-b border-slate-100 shrink-0">
          <button 
            onClick={() => { setActiveDivision('asset'); handleReset(); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeDivision === 'asset' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Database size={16} /> Asset Division (RFA Families)
          </button>
          <button 
            onClick={() => { setActiveDivision('project'); handleReset(); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeDivision === 'project' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Layers size={16} /> Project Division (RVT Layouts)
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-h-[70vh]">
          
          {!revitFile ? (
            <div className="space-y-4">
              <div className="text-center py-10 border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-3xl transition-colors flex flex-col items-center justify-center px-4 bg-slate-50/50">
                <Upload className="text-slate-400 mb-3" size={36} />
                <h3 className="font-bold text-slate-800 text-base mb-1">
                  Upload a Revit {activeDivision === 'asset' ? '.rfa family' : '.rvt project'} file
                </h3>
                <p className="text-xs text-slate-450 max-w-sm mb-4">
                  Drag and drop or browse to select your Revit files. Previews and BIM parameters will be parsed client-side.
                </p>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  accept={activeDivision === 'asset' ? '.rfa' : '.rvt'}
                  onChange={handleRevitUpload}
                  className="hidden" 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-md shadow-indigo-600/10 transition-colors"
                >
                  Select Revit File
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* File Info */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-black">
                    {metadata?.type}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm max-w-[280px] truncate">{revitFile.name}</h4>
                    <p className="text-xs text-slate-450">{(revitFile.size / (1024 * 1024)).toFixed(2)} MB • {metadata?.revitVersion}</p>
                  </div>
                </div>
                <button onClick={handleReset} className="text-xs font-bold text-red-650 hover:text-red-800 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">
                  Remove
                </button>
              </div>

              {/* RFA Preview Extraction & Custom Mesh Linking */}
              {activeDivision === 'asset' && metadata && (
                <div className="grid grid-cols-2 gap-4">
                  {/* Embedded Preview */}
                  <div className="border border-slate-150 rounded-2xl p-4 flex flex-col items-center justify-center bg-slate-50/20">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block self-start">Extracted 2D Plan View / Thumbnail</span>
                    {metadata.previewUrl ? (
                      <img src={metadata.previewUrl} alt="Revit Preview" className="h-32 object-contain rounded-lg border border-slate-100 bg-white" />
                    ) : (
                      <div className="h-32 w-full bg-slate-100 text-slate-400 flex items-center justify-center text-xs rounded-lg border border-slate-200">
                        No Preview Extracted
                      </div>
                    )}
                  </div>

                  {/* OBJ Uploader */}
                  <div className="border border-slate-150 rounded-2xl p-4 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Companion 3D Mesh (.obj)</span>
                      <p className="text-xs text-slate-450 mb-3">Upload a clean model representation for WebGL rendering.</p>
                    </div>

                    {!companionFile ? (
                      <div>
                        <input 
                          type="file" 
                          ref={objInputRef} 
                          accept=".obj"
                          onChange={handleCompanionUpload}
                          className="hidden" 
                        />
                        <button 
                          onClick={() => objInputRef.current?.click()}
                          className="w-full py-3 border border-dashed border-slate-300 hover:border-indigo-400 rounded-xl text-xs font-bold text-indigo-650 flex items-center justify-center gap-1.5 bg-slate-50/50 transition-colors"
                        >
                          <Upload size={14} /> Upload Companion OBJ
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                          <span className="truncate max-w-[150px]">{companionFile.name}</span>
                          <button onClick={() => { setCompanionFile(null); setObjMesh(null); setMeshReport(null); }} className="text-red-500 font-bold hover:underline">Clear</button>
                        </div>
                        {meshReport && (
                          <div className={`p-2.5 rounded-lg flex items-start gap-2 border text-[11px] font-medium leading-relaxed ${meshReport.isWithinBudget ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-amber-50 text-amber-800 border-amber-100'}`}>
                            {meshReport.isWithinBudget ? <CheckCircle size={14} className="shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-600" />}
                            <div>
                              <div>Polygons: {meshReport.facesCount.toLocaleString()} faces</div>
                              {meshReport.warningMessage && <div className="text-[10px] opacity-90 mt-1 font-semibold">{meshReport.warningMessage}</div>}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Parametric Properties & Metadata */}
              {activeDivision === 'asset' && (
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Configure Catalog Parameters</span>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500">Asset Display Name</label>
                      <input 
                        type="text" 
                        value={assetName}
                        onChange={(e) => setAssetName(e.target.value)}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500">Inventory Category</label>
                      <select 
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500"
                      >
                        <option value="Seating">Seating</option>
                        <option value="Furniture">Furniture</option>
                        <option value="Kitchen">Kitchen</option>
                        <option value="Bathroom">Bathroom</option>
                        <option value="Lighting">Lighting</option>
                        <option value="Decor">Decor</option>
                        <option value="Doors">Doors</option>
                        <option value="Windows">Windows</option>
                        <option value="Custom">Custom</option>
                        <option value="Dining">Dining</option>
                        <option value="Tables">Tables</option>
                        <option value="Storage & Display">Storage & Display</option>
                        <option value="Beds & Sleeping">Beds & Sleeping</option>
                        <option value="Bathroom Furniture">Bathroom Furniture</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500">Default Width (m)</label>
                      <input 
                        type="number" 
                        step="0.05"
                        value={width}
                        onChange={(e) => setWidth(parseFloat(e.target.value) || 0.1)}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500">Default Depth (m)</label>
                      <input 
                        type="number" 
                        step="0.05"
                        value={depth}
                        onChange={(e) => setDepth(parseFloat(e.target.value) || 0.1)}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500">Default Height (m)</label>
                      <input 
                        type="number" 
                        step="0.05"
                        value={height}
                        onChange={(e) => setHeight(parseFloat(e.target.value) || 0.1)}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">BIM Description & Notes</label>
                    <textarea 
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                    />
                  </div>
                </div>
              )}

              {/* Project division settings */}
              {activeDivision === 'project' && (
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Project Mapping Configuration</span>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 font-semibold">Convert wall geometry</span>
                    <input type="checkbox" defaultChecked className="w-4 h-4 rounded text-indigo-650" />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 font-semibold">Import structure columns</span>
                    <input type="checkbox" defaultChecked className="w-4 h-4 rounded text-indigo-650" />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 font-semibold">Import doors & windows</span>
                    <input type="checkbox" defaultChecked className="w-4 h-4 rounded text-indigo-650" />
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-colors text-sm">
            Cancel
          </button>
          
          {activeDivision === 'asset' ? (
            <button 
              onClick={handleSaveToInventory}
              disabled={!revitFile || !metadata}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-indigo-600/10 transition-colors text-sm"
            >
              Load to Inventory
            </button>
          ) : (
            <button 
              onClick={handleImportProjectLayout}
              disabled={!revitFile || !metadata}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-indigo-600/10 transition-colors text-sm"
            >
              Place Layout Draft
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
