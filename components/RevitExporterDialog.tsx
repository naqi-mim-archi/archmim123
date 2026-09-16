import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, Download, FileJson, HardDriveDownload, Loader2 } from 'lucide-react';
import { Project, UnitSystem } from '../types';
import {
  createRevitExportManifest,
  getDefaultRevitExportOptions,
  validateRevitExportManifest,
} from '../services/revitExport/revitExportManifest';
import { getRevitExportEngines, getRevitExportJobStatus, startRevitExportJob } from '../services/revitExport/revitExportClient';
import { RevitExportEngineInfo, RevitExportJobResponse, RevitExportOptions } from '../services/revitExport/revitExportTypes';
import { cleanExportFileName } from '../services/sharedBim/projectExportUtils';

interface RevitExporterDialogProps {
  isOpen: boolean;
  project: Project;
  unitSystem: UnitSystem;
  activeLevelId?: string;
  onClose: () => void;
  onJobUpdate: (job: RevitExportJobResponse) => void;
}

const terminalStatuses = new Set(['completed', 'completed_with_warnings', 'failed']);

const progressText: Record<string, string> = {
  queued: 'Preparing Revit export...',
  preparing_manifest: 'Preparing Revit export...',
  uploading: 'Uploading project data...',
  processing: 'Creating Revit model...',
  validating: 'Validating exported project...',
  completed: 'Preparing download...',
  completed_with_warnings: 'Preparing download...',
  failed: 'Revit export failed.',
};

export const RevitExporterDialog: React.FC<RevitExporterDialogProps> = ({
  isOpen,
  project,
  unitSystem,
  activeLevelId,
  onClose,
  onJobUpdate,
}) => {
  const [options, setOptions] = useState<RevitExportOptions>(() => getDefaultRevitExportOptions(project, unitSystem, activeLevelId));
  const [job, setJob] = useState<RevitExportJobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [engines, setEngines] = useState<RevitExportEngineInfo[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(false);
  const pollTimerRef = useRef<number | null>(null);

  const manifest = useMemo(() => createRevitExportManifest(project, options), [project, options]);
  const validation = useMemo(() => validateRevitExportManifest(manifest), [manifest]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoadingEngines(true);
    getRevitExportEngines()
      .then(payload => {
        if (!cancelled) setEngines(payload.engines);
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

  const updateOption = <K extends keyof RevitExportOptions>(key: K, value: RevitExportOptions[K]) => {
    setError(null);
    setJob(null);
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  const toggleSelectedLevel = (levelId: string) => {
    setOptions(prev => {
      const selected = new Set(prev.selectedLevelIds);
      if (selected.has(levelId)) selected.delete(levelId);
      else selected.add(levelId);
      return { ...prev, selectedLevelIds: Array.from(selected) };
    });
  };

  const pollJob = async (jobId: string) => {
    try {
      const next = await getRevitExportJobStatus(jobId);
      setJob(next);
      onJobUpdate(next);
      if (!terminalStatuses.has(next.status)) {
        pollTimerRef.current = window.setTimeout(() => pollJob(jobId), 3500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to poll Revit export status.');
    }
  };

  const handleStart = async () => {
    setIsStarting(true);
    setError(null);
    setJob(null);
    try {
      if (!options.revitEngine) throw new Error('Choose a Revit export version before starting export.');
      if (!validation.isValid) throw new Error(validation.errors.join(' '));
      const started = await startRevitExportJob(manifest);
      setJob(started);
      onJobUpdate(started);
      if (!terminalStatuses.has(started.status)) {
        pollTimerRef.current = window.setTimeout(() => pollJob(started.jobId), 2500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revit export could not be started.');
    } finally {
      setIsStarting(false);
    }
  };

  const downloadJson = (value: unknown, fileName: string) => {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const classEntries = (Object.entries(manifest.summary.classCounts) as Array<[string, number]>)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const status = job?.status || 'queued';
  const isBusy = isStarting || (!!job && !terminalStatuses.has(job.status));
  const selectedEngine = engines.find(engine => engine.engine === options.revitEngine);
  const canStart = validation.isValid && !!options.revitEngine && !isLoadingEngines && (!selectedEngine || selectedEngine.configured);

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[160] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <HardDriveDownload size={21} className="text-violet-700" />
            <div>
              <h2 className="font-black text-lg text-slate-900">Export Revit Project (.RVT) - Beta</h2>
              <p className="text-xs text-slate-500">Direct project data to APS Revit Automation workflow</p>
            </div>
          </div>
          <button onClick={onClose} disabled={isBusy} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 transition-colors disabled:opacity-50">
            <ChevronLeft size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-5">
          <div className="space-y-4">
            <section className="border border-slate-200 rounded-2xl p-4">
              <div className="text-sm font-black text-slate-900">Export Settings</div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Creates a Revit project directly from your current editable design data. Supported building elements are created as native Revit objects where possible.
              </p>
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Revit Export Version</span>
                  <select
                    value={options.revitEngine || ''}
                    onChange={(event) => updateOption('revitEngine', event.target.value)}
                    disabled={isBusy || isLoadingEngines}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white disabled:bg-slate-100"
                  >
                    <option value="">{isLoadingEngines ? 'Loading APS Revit versions...' : 'Choose Revit version'}</option>
                    {engines.map(engine => (
                      <option key={engine.engine} value={engine.engine}>
                        Revit {engine.year}{engine.configured ? '' : ' - setup required'}
                      </option>
                    ))}
                  </select>
                  {selectedEngine && !selectedEngine.configured && (
                    <span className="block mt-1 text-[11px] font-semibold text-amber-700">
                      This APS engine is available, but its matching AppBundle/Activity has not been prepared on this server yet.
                    </span>
                  )}
                </label>
                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Project Name</span>
                  <input
                    value={options.projectName}
                    onChange={(event) => updateOption('projectName', event.target.value)}
                    disabled={isBusy}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 disabled:bg-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Project Code</span>
                  <input
                    value={options.projectCode || ''}
                    onChange={(event) => updateOption('projectCode', event.target.value)}
                    disabled={isBusy}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 disabled:bg-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Description</span>
                  <textarea
                    value={options.projectDescription || ''}
                    onChange={(event) => updateOption('projectDescription', event.target.value)}
                    rows={3}
                    disabled={isBusy}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 resize-none disabled:bg-slate-100"
                  />
                </label>
              </div>
            </section>

            <section className="border border-slate-200 rounded-2xl p-4">
              <div className="text-sm font-black text-slate-900 mb-3">Level Scope</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'all', label: 'All Levels' },
                  { id: 'active', label: 'Active Level' },
                  { id: 'selected', label: 'Selected' },
                ].map(item => (
                  <button
                    key={item.id}
                    disabled={isBusy}
                    onClick={() => updateOption('levelScope', item.id as RevitExportOptions['levelScope'])}
                    className={`rounded-xl border px-3 py-2 text-xs font-black transition-colors disabled:opacity-60 ${options.levelScope === item.id ? 'border-violet-600 bg-violet-50 text-violet-800' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
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
                        onChange={() => toggleSelectedLevel(level.id)}
                        disabled={isBusy}
                        className="h-4 w-4 accent-violet-700"
                      />
                    </label>
                  ))}
                </div>
              )}
            </section>

            <section className="border border-slate-200 rounded-2xl p-4">
              <div className="text-sm font-black text-slate-900 mb-3">Include</div>
              <div className="space-y-2">
                <Toggle label="Furniture" checked={options.includeFurniture} disabled={isBusy} onChange={(value) => updateOption('includeFurniture', value)} />
                <Toggle label="Annotations" checked={options.includeAnnotations} disabled={isBusy} onChange={(value) => updateOption('includeAnnotations', value)} />
                <Toggle label="Unsupported objects as Revit geometry fallback" checked={options.includeUnsupportedAsDirectShape} disabled={isBusy} onChange={(value) => updateOption('includeUnsupportedAsDirectShape', value)} />
                <Toggle label="Create native families where supported" checked={options.createNativeFamilies} disabled={isBusy} onChange={(value) => updateOption('createNativeFamilies', value)} />
                <Toggle label="Run export validation" checked={options.runValidation} disabled={isBusy} onChange={(value) => updateOption('runValidation', value)} />
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-slate-900">Direct Manifest Preflight</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Manifest version {manifest.manifestVersion}; source units are metres; export engine {options.revitEngine ? `Revit ${options.revitEngine.match(/\d+$/)?.[0] || options.revitEngine}` : 'not selected'}.
                  </div>
                </div>
                <button
                  onClick={() => downloadJson(manifest, `${cleanExportFileName(options.projectName, 'revit-export')}.manifest.json`)}
                  className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <FileJson size={14} /> Manifest
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                <Stat label="Levels" value={manifest.levels.length} />
                <Stat label="Elements" value={manifest.summary.exportedElementCount} />
                <Stat label="Fallback" value={manifest.summary.fallbackElementCount} />
                <Stat label="Skipped" value={manifest.summary.skippedElementCount} />
              </div>
              <div className="mt-4 bg-white border border-slate-200 rounded-xl p-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Manifest Classes</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-1 max-h-36 overflow-y-auto">
                  {classEntries.map(([name, count]) => (
                    <div key={name} className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{name}</span>
                      <span className="font-black text-slate-900">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
              {(!validation.isValid || validation.warnings.length > 0) && (
                <div className="mt-4 space-y-2 max-h-36 overflow-y-auto">
                  {[...validation.errors.map(message => ({ level: 'error' as const, message })), ...validation.warnings.slice(0, 8).map(message => ({ level: 'warning' as const, message }))].map((item, index) => (
                    <div key={`${item.level}-${index}`} className="flex gap-2 text-xs">
                      <AlertTriangle size={14} className={item.level === 'error' ? 'text-red-600 shrink-0 mt-0.5' : 'text-amber-600 shrink-0 mt-0.5'} />
                      <span className="text-slate-600">{item.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {(job || isStarting || error) && (
              <section className="border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {job?.status === 'completed' || job?.status === 'completed_with_warnings' ? (
                      <CheckCircle2 size={18} className="text-emerald-700" />
                    ) : error || job?.status === 'failed' ? (
                      <AlertTriangle size={18} className="text-red-700" />
                    ) : (
                      <Loader2 size={18} className="text-violet-700 animate-spin" />
                    )}
                    <div>
                      <div className="font-black text-sm text-slate-900">{job?.status || (isStarting ? 'preparing_manifest' : 'failed')}</div>
                      <div className="text-xs text-slate-500">{job?.progressMessage || progressText[status]}</div>
                    </div>
                  </div>
                  {job?.jobId && <div className="text-[10px] font-mono text-slate-400">{job.jobId}</div>}
                </div>

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
              disabled={isBusy || !canStart}
              className="px-5 py-2.5 bg-violet-700 hover:bg-violet-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-black rounded-xl text-sm transition-colors flex items-center gap-2"
            >
              {isBusy ? <Loader2 size={16} className="animate-spin" /> : <HardDriveDownload size={16} />}
              {isBusy ? progressText[status] || 'Working...' : 'Start RVT Export'}
            </button>
            <a
              href={job?.downloadUrl || undefined}
              className={`px-5 py-2.5 rounded-xl text-sm font-black transition-colors flex items-center gap-2 ${job?.downloadUrl ? 'bg-slate-900 hover:bg-slate-800 text-white' : 'bg-slate-200 text-slate-400 pointer-events-none'}`}
              download
            >
              <Download size={16} />
              Download Revit Project (.RVT)
            </a>
            <a
              href={job?.reportUrl || undefined}
              className={`px-5 py-2.5 rounded-xl text-sm font-black transition-colors flex items-center gap-2 ${job?.reportUrl ? 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-50' : 'bg-slate-100 text-slate-400 pointer-events-none'}`}
              download
            >
              <FileJson size={16} />
              Report
            </a>
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
      className="h-4 w-4 accent-violet-700"
    />
  </label>
);

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-3">
    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div>
    <div className="text-lg font-black text-slate-900 mt-1">{value}</div>
  </div>
);
