import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Download, FileText, Loader2 } from 'lucide-react';
import type { VectorPdfExportOptions } from './Canvas';

interface PdfExportDialogProps {
  isOpen: boolean;
  projectName: string;
  onClose: () => void;
  onExport: (options: VectorPdfExportOptions) => Promise<void>;
}

type SheetName = 'A3' | 'A2' | 'A1' | 'Custom';
type Orientation = 'portrait' | 'landscape';

const SHEETS: Record<Exclude<SheetName, 'Custom'>, [number, number]> = {
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
};

const PdfExportDialog: React.FC<PdfExportDialogProps> = ({ isOpen, projectName, onClose, onExport }) => {
  const [sheet, setSheet] = useState<SheetName>('A3');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [customWidth, setCustomWidth] = useState(420);
  const [customHeight, setCustomHeight] = useState(297);
  const [scalePreset, setScalePreset] = useState<'50' | '100' | 'custom'>('100');
  const [customScale, setCustomScale] = useState(75);
  const [margin, setMargin] = useState(12);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setIsExporting(false);
    }
  }, [isOpen]);

  const pageSize = useMemo(() => {
    const base = sheet === 'Custom' ? [customWidth, customHeight] : SHEETS[sheet];
    const shortSide = Math.min(base[0], base[1]);
    const longSide = Math.max(base[0], base[1]);
    return orientation === 'landscape' ? [longSide, shortSide] : [shortSide, longSide];
  }, [customHeight, customWidth, orientation, sheet]);

  if (!isOpen) return null;

  const handleExport = async () => {
    const scale = scalePreset === 'custom' ? customScale : Number(scalePreset);
    if (pageSize.some(value => !Number.isFinite(value) || value <= 0) || !Number.isFinite(scale) || scale <= 0) {
      setError('Enter valid positive sheet dimensions and scale.');
      return;
    }

    setIsExporting(true);
    setError(null);
    try {
      await onExport({
        sheetWidthMm: pageSize[0],
        sheetHeightMm: pageSize[1],
        scale,
        marginMm: margin,
        fileName: `${projectName || 'plan'}-${sheet}-${scale}`,
      });
      onClose();
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'PDF export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
  const labelClass = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500';

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onMouseDown={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-2 text-blue-600"><FileText size={20} /></div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Vector PDF Export</h2>
              <p className="text-xs text-slate-500">2D plan only, using the canvas drawing rules</p>
            </div>
          </div>
          <button onClick={onClose} disabled={isExporting} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Back"><ChevronLeft size={18} /></button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <label>
              <span className={labelClass}>Sheet size</span>
              <select className={inputClass} value={sheet} onChange={event => setSheet(event.target.value as SheetName)}>
                <option value="A3">A3</option>
                <option value="A2">A2</option>
                <option value="A1">A1</option>
                <option value="Custom">Custom</option>
              </select>
            </label>
            <label>
              <span className={labelClass}>Orientation</span>
              <select className={inputClass} value={orientation} onChange={event => setOrientation(event.target.value as Orientation)}>
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </label>
          </div>

          {sheet === 'Custom' && (
            <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4">
              <label>
                <span className={labelClass}>Width (mm)</span>
                <input className={inputClass} type="number" min="50" step="1" value={customWidth} onChange={event => setCustomWidth(Number(event.target.value))} />
              </label>
              <label>
                <span className={labelClass}>Height (mm)</span>
                <input className={inputClass} type="number" min="50" step="1" value={customHeight} onChange={event => setCustomHeight(Number(event.target.value))} />
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <label>
              <span className={labelClass}>Print scale</span>
              <select className={inputClass} value={scalePreset} onChange={event => setScalePreset(event.target.value as '50' | '100' | 'custom')}>
                <option value="50">1:50</option>
                <option value="100">1:100</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            {scalePreset === 'custom' ? (
              <label>
                <span className={labelClass}>Custom scale (1:n)</span>
                <input className={inputClass} type="number" min="1" step="1" value={customScale} onChange={event => setCustomScale(Number(event.target.value))} />
              </label>
            ) : (
              <label>
                <span className={labelClass}>Margin (mm)</span>
                <input className={inputClass} type="number" min="0" step="1" value={margin} onChange={event => setMargin(Number(event.target.value))} />
              </label>
            )}
          </div>

          {scalePreset === 'custom' && (
            <label className="block max-w-[calc(50%-0.5rem)]">
              <span className={labelClass}>Margin (mm)</span>
              <input className={inputClass} type="number" min="0" step="1" value={margin} onChange={event => setMargin(Number(event.target.value))} />
            </label>
          )}

          <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-900">
            <span>Output</span>
            <strong>{Math.round(pageSize[0])} x {Math.round(pageSize[1])} mm at 1:{scalePreset === 'custom' ? customScale : scalePreset}</strong>
          </div>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button onClick={onClose} disabled={isExporting} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200">Cancel</button>
          <button onClick={handleExport} disabled={isExporting} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {isExporting ? 'Exporting...' : 'Export Vector PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PdfExportDialog;
