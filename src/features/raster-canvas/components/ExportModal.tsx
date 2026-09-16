import React, { useState } from 'react';
import { ChevronLeft, Download, FileImage, Check } from 'lucide-react';
import { CanvasLayer } from '../types/canvas';
import { CanvasEngine } from '../core/CanvasEngine';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  layers: CanvasLayer[];
  width: number;
  height: number;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  layers,
  width,
  height,
}) => {
  const [format, setFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [scale, setScale] = useState<number>(1);
  const [quality, setQuality] = useState<number>(92);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  if (!isOpen) return null;

  const exportWidth = Math.round(width * scale);
  const exportHeight = Math.round(height * scale);

  const handleDownload = () => {
    setIsExporting(true);
    try {
      const outCanvas = document.createElement('canvas');
      outCanvas.width = exportWidth;
      outCanvas.height = exportHeight;

      // Composite layers
      CanvasEngine.compositeLayers(layers, outCanvas, exportWidth, exportHeight);

      const mimeType = `image/${format}`;
      const dataUrl = outCanvas.toDataURL(mimeType, quality / 100);

      const link = document.createElement('a');
      link.download = `render-export-${Date.now()}.${format === 'jpeg' ? 'jpg' : format}`;
      link.href = dataUrl;
      link.click();
      onClose();
    } catch (e) {
      console.error('Export error:', e);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <FileImage size={16} className="text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-100">Export Canvas</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Format Picker */}
          <div className="space-y-1.5">
            <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">File Format</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'png', label: 'PNG (Lossless / Alpha)' },
                { id: 'jpeg', label: 'JPG (Compact)' },
                { id: 'webp', label: 'WebP (Modern)' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id as any)}
                  className={`p-2.5 rounded-xl border text-center font-semibold transition-all cursor-pointer ${
                    format === f.id
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Resolution Multiplier */}
          <div className="space-y-1.5">
            <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Resolution</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { s: 1, label: '1x (Original)' },
                { s: 2, label: '2x (High-Res)' },
                { s: 4, label: '4x (Ultra HD)' },
              ].map(item => (
                <button
                  key={item.s}
                  onClick={() => setScale(item.s)}
                  className={`p-2.5 rounded-xl border text-center font-semibold transition-all cursor-pointer ${
                    scale === item.s
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 font-mono">
              Output Dimensions: {exportWidth} × {exportHeight} px
            </p>
          </div>

          {/* Quality slider (if JPG or WebP) */}
          {format !== 'png' && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Quality:</span>
                <span className="font-mono text-slate-300 font-bold">{quality}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="100"
                value={quality}
                onChange={e => setQuality(Number(e.target.value))}
                className="w-full accent-indigo-500 h-1 cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-950/80 border-t border-slate-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={isExporting}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-2 rounded-xl shadow-lg shadow-indigo-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Download size={13} />
            <span>Download {format.toUpperCase()}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
