import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, Download, FileCode2, Loader2, Settings2 } from 'lucide-react';
import { Project, UnitSystem } from '../types';
import {
  BIM_EXPORT_SCHEMA,
  BimExportOptions,
  BimExportResult,
  downloadIfcFile,
  exportProjectToIfc,
  getBimExportPreflightSummary,
} from '../services/bimExportService';

interface BimExporterDialogProps {
  isOpen: boolean;
  project: Project;
  unitSystem: UnitSystem;
  activeLevelId?: string;
  onClose: () => void;
  onExportComplete: (result: BimExportResult) => void;
}

const classSort = (entries: [string, number][]) => [...entries].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

export const BimExporterDialog: React.FC<BimExporterDialogProps> = ({
  isOpen,
  project,
  unitSystem,
  activeLevelId,
  onClose,
  onExportComplete,
}) => {
  const [options, setOptions] = useState<BimExportOptions>(() => ({
    schema: BIM_EXPORT_SCHEMA,
    projectName: project.name || 'Archi AI Project',
    projectDescription: project.metadata?.description || '',
    projectCode: project.metadata?.projectCode || '',
    unitSystem,
    levelScope: 'all',
    selectedLevelIds: project.levels.map(level => level.id),
    activeLevelId,
    includeUnsupportedAsProxy: true,
  }));
  const [result, setResult] = useState<BimExportResult | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preflight = useMemo(() => getBimExportPreflightSummary(project, options), [project, options]);

  if (!isOpen) return null;

  const updateOption = <K extends keyof BimExportOptions>(key: K, value: BimExportOptions[K]) => {
    setResult(null);
    setError(null);
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  const handleLevelToggle = (levelId: string) => {
    setResult(null);
    setError(null);
    setOptions(prev => {
      const selected = new Set(prev.selectedLevelIds);
      if (selected.has(levelId)) selected.delete(levelId);
      else selected.add(levelId);
      return { ...prev, selectedLevelIds: Array.from(selected) };
    });
  };

  const handleGenerate = async () => {
    setIsExporting(true);
    setError(null);
    setResult(null);
    try {
      const exportResult = exportProjectToIfc(project, options);
      setResult(exportResult);
      if (exportResult.validation.isValid) onExportComplete(exportResult);
      else setError('IFC export failed validation. Review the validation errors below.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'BIM Exporter failed to generate IFC.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload = () => {
    if (!result || !result.validation.isValid) return;
    downloadIfcFile(result.ifcText, result.fileName);
  };

  const warningCount = result?.logs.filter(item => item.level === 'warning').length || 0;
  const errorCount = result?.logs.filter(item => item.level === 'error').length || 0;

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[160] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <FileCode2 size={21} className="text-emerald-700" />
            <div>
              <h2 className="font-black text-lg text-slate-900">BIM Exporter</h2>
              <p className="text-xs text-slate-500">Main Canvas to structured IFC export</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 transition-colors">
            <ChevronLeft size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-5">
          <div className="space-y-4">
            <section className="border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <Settings2 size={16} className="text-emerald-700" />
                <div className="text-sm font-black text-slate-900">Export Settings</div>
              </div>
              <div className="space-y-3">
                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">IFC Schema</span>
                  <select
                    value={options.schema}
                    onChange={(event) => updateOption('schema', event.target.value as typeof BIM_EXPORT_SCHEMA)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
                  >
                    <option value={BIM_EXPORT_SCHEMA}>IFC4 Coordination View</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Project Name</span>
                  <input
                    value={options.projectName}
                    onChange={(event) => updateOption('projectName', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Project Code</span>
                  <input
                    value={options.projectCode || ''}
                    onChange={(event) => updateOption('projectCode', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Description</span>
                  <textarea
                    value={options.projectDescription || ''}
                    onChange={(event) => updateOption('projectDescription', event.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 resize-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Unit System</span>
                  <select
                    value={options.unitSystem}
                    onChange={(event) => updateOption('unitSystem', event.target.value as UnitSystem)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
                  >
                    <option value="metric">Metric project, IFC metres</option>
                    <option value="imperial">Imperial project, IFC metres</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="border border-slate-200 rounded-2xl p-4">
              <div className="text-sm font-black text-slate-900 mb-3">Export Scope</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'all', label: 'All Levels' },
                  { id: 'active', label: 'Active' },
                  { id: 'selected', label: 'Selected' },
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => updateOption('levelScope', item.id as BimExportOptions['levelScope'])}
                    className={`rounded-xl border px-3 py-2 text-xs font-black transition-colors ${options.levelScope === item.id ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {options.levelScope === 'selected' && (
                <div className="mt-3 space-y-2 max-h-36 overflow-y-auto pr-1">
                  {project.levels.map(level => (
                    <label key={level.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2 text-sm">
                      <span className="font-semibold text-slate-700">{level.name}</span>
                      <input
                        type="checkbox"
                        checked={options.selectedLevelIds.includes(level.id)}
                        onChange={() => handleLevelToggle(level.id)}
                        className="h-4 w-4 accent-emerald-700"
                      />
                    </label>
                  ))}
                </div>
              )}
              <label className="mt-4 flex items-start gap-3 rounded-xl bg-slate-50 p-3">
                <input
                  type="checkbox"
                  checked={options.includeUnsupportedAsProxy}
                  onChange={(event) => updateOption('includeUnsupportedAsProxy', event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-emerald-700"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-800">Include unsupported objects as IFC proxies</span>
                  <span className="block text-xs text-slate-500 mt-0.5">Unsupported native objects retain placement, dimensions, and metadata as IfcBuildingElementProxy.</span>
                </span>
              </label>
            </section>
          </div>

          <div className="space-y-4">
            <section className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-sm font-black text-slate-900">Preflight Summary</div>
                  <div className="text-xs text-slate-500 mt-0.5">{BIM_EXPORT_SCHEMA} is the supported schema for this implementation.</div>
                </div>
                <div className="rounded-full bg-white border border-slate-200 px-3 py-1 text-xs font-black text-slate-700">
                  {preflight.sourceElementCount} source objects
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Levels" value={preflight.levelCount} />
                <Stat label="Native" value={preflight.exportedNativeElements} />
                <Stat label="Proxy" value={preflight.proxyExports} />
                <Stat label="Skipped" value={preflight.skippedElements} />
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-3">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">IFC Classes</div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {classSort(Object.entries(preflight.classCounts)).map(([name, count]) => (
                      <div key={name} className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700">{name}</span>
                        <span className="font-black text-slate-900">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Storeys</div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {preflight.levelSummaries.map(level => (
                      <div key={level.id} className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700 truncate">{level.name}</span>
                        <span className="font-black text-slate-900">{level.elevation.toFixed(3)} m</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 flex gap-3">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-sm">Export blocked</div>
                  <div className="text-xs mt-1 leading-relaxed">{error}</div>
                </div>
              </div>
            )}

            {result && (
              <section className={`border rounded-2xl p-4 ${result.validation.isValid ? 'border-emerald-200 bg-emerald-50/40' : 'border-red-200 bg-red-50/40'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {result.validation.isValid ? <CheckCircle2 size={18} className="text-emerald-700" /> : <AlertTriangle size={18} className="text-red-700" />}
                    <div className="font-black text-sm text-slate-900">
                      {result.validation.isValid ? 'IFC validation passed' : 'IFC validation failed'}
                    </div>
                  </div>
                  <div className="text-xs font-black text-slate-600">{warningCount} warnings · {errorCount} errors</div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  <Stat label="Exported" value={result.summary.exportedNativeElements} />
                  <Stat label="IFC Objects" value={result.summary.generatedIfcObjects} />
                  <Stat label="Proxy" value={result.summary.proxyExports} />
                  <Stat label="Skipped" value={result.summary.skippedElements} />
                </div>
                <div className="mt-4 max-h-44 overflow-y-auto space-y-2 pr-1">
                  {[...result.validation.errors.map(message => ({ level: 'error' as const, code: 'VALIDATION_ERROR', message })), ...result.logs].slice(0, 18).map((item, index) => (
                    <div key={`${item.code}-${index}`} className="flex items-start gap-2 text-xs">
                      {item.level === 'info' ? (
                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle size={14} className={item.level === 'error' ? 'text-red-600 shrink-0 mt-0.5' : 'text-amber-600 shrink-0 mt-0.5'} />
                      )}
                      <div>
                        <span className="font-bold text-slate-700">{item.code}</span>
                        <span className="text-slate-500"> · {item.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 flex justify-between gap-3 shrink-0">
          <button onClick={onClose} disabled={isExporting} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-bold rounded-xl text-sm transition-colors">
            Close
          </button>
          <div className="flex gap-3">
            <button
              onClick={handleGenerate}
              disabled={isExporting || !preflight.sourceElementCount}
              className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-black rounded-xl text-sm transition-colors flex items-center gap-2"
            >
              {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileCode2 size={16} />}
              {isExporting ? 'Generating...' : 'Generate IFC'}
            </button>
            <button
              onClick={handleDownload}
              disabled={!result?.validation.isValid || isExporting}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-black rounded-xl text-sm transition-colors flex items-center gap-2"
            >
              <Download size={16} />
              Download .IFC
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-3">
    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div>
    <div className="text-lg font-black text-slate-900 mt-1">{value}</div>
  </div>
);
