import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, DatabaseZap, FileJson, FolderOpen, Loader2, Upload } from 'lucide-react';
import { Project } from '../types';
import {
  getApsRevitImportEngines,
  getApsRevitImportJobStatus,
  startApsRevitImportJob,
} from '../services/apsRevitImport/apsRevitImportClient';
import {
  ApsRevitImportEngineInfo,
  ApsRevitImportJobResponse,
  ApsRevitImportOptions,
} from '../services/apsRevitImport/apsRevitImportTypes';
import {
  getApsRevitImportSupportedCategories,
  getDefaultApsRevitImportOptions,
} from '../services/apsRevitImport/apsRevitImportConverter';

interface ApsRevitImporterDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (project: Project, job: ApsRevitImportJobResponse) => void;
}

const terminalStatuses = new Set(['completed', 'completed_with_warnings', 'failed']);

const progressText: Record<string, string> = {
  queued: 'Queued in APS Revit Automation...',
  uploading: 'Uploading RVT...',
  extracting_revit_data: 'Extracting Revit DB data...',
  converting_to_canvas: 'Converting to native canvas...',
  validating: 'Validating native project...',
  completed: 'Import complete.',
  completed_with_warnings: 'Import complete with warnings.',
  failed: 'Import failed.',
};

export const ApsRevitImporterDialog: React.FC<ApsRevitImporterDialogProps> = ({ isOpen, onClose, onImportComplete }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<ApsRevitImportOptions>(() => getDefaultApsRevitImportOptions());
  const [engines, setEngines] = useState<ApsRevitImportEngineInfo[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [job, setJob] = useState<ApsRevitImportJobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoadingEngines(true);
    getApsRevitImportEngines()
      .then(payload => {
        if (cancelled) return;
        setEngines(payload.engines);
        const defaultEngine = payload.engines.find(engine => engine.isDefault && engine.configured) || payload.engines.find(engine => engine.configured);
        if (defaultEngine) setOptions(prev => ({ ...prev, revitEngine: prev.revitEngine || defaultEngine.engine }));
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load APS Revit engines.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingEngines(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedEngine = engines.find(engine => engine.engine === options.revitEngine);
  const isBusy = isStarting || (!!job && !terminalStatuses.has(job.status));
  const canStart = !!file && !!options.revitEngine && (!selectedEngine || selectedEngine.configured) && !isBusy && !isLoadingEngines;
  const supportedCategories = getApsRevitImportSupportedCategories();

  const updateOption = <K extends keyof ApsRevitImportOptions>(key: K, value: ApsRevitImportOptions[K]) => {
    setError(null);
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  const pollJob = async (jobId: string) => {
    try {
      const next = await getApsRevitImportJobStatus(jobId);
      setJob(next);
      if (!terminalStatuses.has(next.status)) {
        pollTimerRef.current = window.setTimeout(() => pollJob(jobId), 4000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to poll APS Revit import status.');
    }
  };

  const handleStart = async () => {
    if (!file) return;
    setIsStarting(true);
    setError(null);
    setJob(null);
    try {
      if (!file.name.toLowerCase().endsWith('.rvt')) throw new Error('Choose a real .rvt file for APS Revit Importer.');
      if (!options.revitEngine) throw new Error('Choose a configured APS Revit engine.');
      const started = await startApsRevitImportJob(file, options);
      setJob(started);
      if (!terminalStatuses.has(started.status)) {
        pollTimerRef.current = window.setTimeout(() => pollJob(started.jobId), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'APS Revit import could not be started.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleOpenProject = () => {
    if (!job?.project) return;
    onImportComplete(job.project, job);
  };

  const status = job?.status || 'queued';
  const report = job?.report;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[160] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <DatabaseZap size={21} className="text-blue-700" />
            <div>
              <h2 className="font-black text-lg text-slate-900">APS Revit Importer</h2>
              <p className="text-xs text-slate-500">Direct RVT to editable native canvas through APS Revit Automation</p>
            </div>
          </div>
          <button onClick={onClose} disabled={isBusy} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 transition-colors disabled:opacity-50">
            <ChevronLeft size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-5">
          <div className="space-y-4">
            <section className="border border-slate-200 rounded-xl p-4">
              <div className="text-sm font-black text-slate-900">Source RVT</div>
              <div className="mt-4 border-2 border-dashed border-blue-200 rounded-xl bg-blue-50/35 p-5 flex flex-col items-center text-center">
                <Upload className="text-blue-700 mb-3" size={32} />
                <div className="font-black text-slate-900">{file ? file.name : 'Select a Revit project file'}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : 'The importer uploads RVT to APS OSS and extracts Revit DB API data headlessly.'}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".rvt,application/octet-stream"
                  className="hidden"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] || null;
                    setFile(nextFile);
                    setJob(null);
                    setError(null);
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy}
                  className="mt-4 px-4 py-2 bg-white border border-blue-200 hover:bg-blue-50 text-blue-800 font-bold rounded-xl text-sm transition-colors disabled:opacity-50"
                >
                  Choose RVT File
                </button>
              </div>
            </section>

            <section className="border border-slate-200 rounded-xl p-4">
              <div className="text-sm font-black text-slate-900">APS Extraction Settings</div>
              <label className="block mt-4">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Revit Automation Engine</span>
                <select
                  value={options.revitEngine || ''}
                  onChange={(event) => updateOption('revitEngine', event.target.value)}
                  disabled={isBusy || isLoadingEngines}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white disabled:bg-slate-100"
                >
                  <option value="">{isLoadingEngines ? 'Loading APS Revit versions...' : 'Choose Revit version'}</option>
                  {engines.map(engine => (
                    <option key={engine.engine} value={engine.engine}>
                      Revit {engine.year}{engine.configured ? '' : ' - importer setup required'}
                    </option>
                  ))}
                </select>
                {selectedEngine && !selectedEngine.configured && (
                  <span className="block mt-1 text-[11px] font-semibold text-amber-700">
                    This engine exists in APS, but APS Revit Importer resources are not configured for it yet.
                  </span>
                )}
              </label>
              <div className="mt-4 space-y-2">
                <Toggle label="Import model elements" checked={options.importModelElements} disabled={isBusy} onChange={(value) => updateOption('importModelElements', value)} />
                <Toggle label="Import plan annotations" checked={options.importPlanAnnotations} disabled={isBusy} onChange={(value) => updateOption('importPlanAnnotations', value)} />
                <Toggle label="Import dimensions" checked={options.importDimensions} disabled={isBusy || !options.importPlanAnnotations} onChange={(value) => updateOption('importDimensions', value)} />
                <Toggle label="Generic/custom families as blocks" checked={options.importGenericFamiliesAsBlocks} disabled={isBusy} onChange={(value) => updateOption('importGenericFamiliesAsBlocks', value)} />
                <Toggle label="Linked models as warnings only" checked={options.includeLinkedModelReferencesAsWarnings} disabled={isBusy} onChange={(value) => updateOption('includeLinkedModelReferencesAsWarnings', value)} />
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="border border-slate-200 rounded-xl p-4 bg-slate-50">
              <div className="text-sm font-black text-slate-900">Native Mapping Coverage</div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {supportedCategories.map(category => (
                  <span key={category} className="px-2 py-1 rounded-md bg-white border border-slate-200 text-[11px] font-semibold text-slate-600">
                    {category}
                  </span>
                ))}
              </div>
            </section>

            {(job || isStarting || error) && (
              <section className="border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {job?.status === 'completed' || job?.status === 'completed_with_warnings' ? (
                      <CheckCircle2 size={18} className="text-emerald-700" />
                    ) : error || job?.status === 'failed' ? (
                      <AlertTriangle size={18} className="text-red-700" />
                    ) : (
                      <Loader2 size={18} className="text-blue-700 animate-spin" />
                    )}
                    <div>
                      <div className="font-black text-sm text-slate-900">{job?.status || (isStarting ? 'uploading' : 'queued')}</div>
                      <div className="text-xs text-slate-500">{job?.progressMessage || progressText[status]}</div>
                    </div>
                  </div>
                  {job?.jobId && <div className="text-[10px] font-mono text-slate-400">{job.jobId}</div>}
                </div>

                {report && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                    <Stat label="Native" value={report.nativeElementCount} />
                    <Stat label="Fallback" value={report.fallbackElementCount} />
                    <Stat label="Skipped" value={report.skippedElementCount} />
                    <Stat label="Levels" value={report.levels.length} />
                  </div>
                )}

                {error && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800">
                    {error}
                  </div>
                )}

                {job?.warnings?.length ? (
                  <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1 max-h-28 overflow-y-auto">
                    {job.warnings.slice(0, 8).map((warning, index) => (
                      <div key={index} className="text-xs text-amber-900">{warning}</div>
                    ))}
                  </div>
                ) : null}

                {job?.errors?.length ? (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 space-y-1 max-h-28 overflow-y-auto">
                    {job.errors.slice(0, 8).map((jobError, index) => (
                      <div key={index} className="text-xs text-red-800">{jobError}</div>
                    ))}
                  </div>
                ) : null}

                {report?.elementMappings?.length ? (
                  <div className="mt-4 border border-slate-200 rounded-xl bg-white p-3">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Recent Mappings</div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {report.elementMappings.slice(0, 10).map((row, index) => (
                        <div key={`${row.sourceRevitElementId}-${index}`} className="flex items-center justify-between gap-3 text-xs">
                          <span className="truncate text-slate-600">{row.sourceRevitCategory} {row.sourceRevitElementId}</span>
                          <span className={`font-black ${row.result === 'native' ? 'text-emerald-700' : row.result === 'fallback' ? 'text-amber-700' : 'text-red-700'}`}>
                            {row.result}{row.targetNativeType ? `/${row.targetNativeType}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 flex justify-between gap-3 shrink-0">
          <button onClick={onClose} disabled={isBusy} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-bold rounded-xl text-sm transition-colors">
            Close
          </button>
          <div className="flex gap-3">
            <button
              onClick={handleStart}
              disabled={!canStart}
              className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-black rounded-xl text-sm transition-colors flex items-center gap-2"
            >
              {isBusy ? <Loader2 size={16} className="animate-spin" /> : <DatabaseZap size={16} />}
              {isBusy ? progressText[status] || 'Working...' : 'Start APS Revit Import'}
            </button>
            <a
              href={job?.reportUrl || undefined}
              className={`px-4 py-2.5 rounded-xl text-sm font-black transition-colors flex items-center gap-2 ${job?.reportUrl ? 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-50' : 'bg-slate-100 text-slate-400 pointer-events-none'}`}
              download
            >
              <FileJson size={16} />
              Report
            </a>
            <button
              onClick={handleOpenProject}
              disabled={!job?.project || isBusy}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-black rounded-xl text-sm transition-colors flex items-center gap-2"
            >
              <FolderOpen size={16} />
              Open Imported Project
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Toggle = ({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) => (
  <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2 text-sm">
    <span className="font-semibold text-slate-700">{label}</span>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 accent-blue-700"
    />
  </label>
);

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-3">
    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div>
    <div className="text-lg font-black text-slate-900 mt-1">{value}</div>
  </div>
);
