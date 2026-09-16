import React, { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, Database, FileCode2, Loader2, Upload } from 'lucide-react';
import { BimImportSession, createBimImportSessionFromFile, getBimImportSupportedCategories } from '../services/bimImportService';

interface BimImporterWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionReady: (session: BimImportSession) => void;
}

export const BimImporterWizard: React.FC<BimImporterWizardProps> = ({ isOpen, onClose, onSessionReady }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<BimImportSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const reset = () => {
    setSession(null);
    setError(null);
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setIsLoading(true);
    setError(null);
    setSession(null);
    try {
      const nextSession = await createBimImportSessionFromFile(file);
      setSession(nextSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'BIM Importer failed to read the IFC file.');
    } finally {
      setIsLoading(false);
    }
  };

  const warningCount = session?.logs.filter(item => item.level === 'warning').length || 0;
  const errorCount = session?.logs.filter(item => item.level === 'error').length || 0;
  const supportedCategories = getBimImportSupportedCategories();

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[160] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[88vh] animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <Database size={21} className="text-cyan-700" />
            <div>
              <h2 className="font-black text-lg text-slate-900">BIM Importer</h2>
              <p className="text-xs text-slate-500">Independent IFC-to-Main-Canvas conversion workflow</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 transition-colors">
            <ChevronLeft size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {!session && !isLoading && (
            <div className="border-2 border-dashed border-cyan-200 rounded-2xl bg-cyan-50/35 p-8 flex flex-col items-center text-center">
              <Upload className="text-cyan-700 mb-3" size={36} />
              <h3 className="font-black text-slate-900">Select an IFC file</h3>
              <p className="text-sm text-slate-500 mt-2 max-w-xl">
                BIM Importer creates a preview session first. Conversion into editable Main Canvas elements only happens after you review it and click Convert to Interactive.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ifc,application/x-step,text/plain"
                className="hidden"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-5 px-5 py-2.5 bg-cyan-700 hover:bg-cyan-800 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2"
              >
                <Upload size={16} /> Select IFC File
              </button>
              <div className="mt-5 text-[11px] text-slate-500 max-w-xl leading-relaxed">
                Export the Revit project as IFC, then upload the `.ifc` file here. This importer parses IFC storeys, placements, geometry, and supported BIM classes without direct `.rvt` parsing.
              </div>
            </div>
          )}

          {isLoading && (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-10 h-10 text-cyan-700 animate-spin" />
              <div className="mt-4 font-black text-slate-900">Reading BIM file</div>
              <div className="text-sm text-slate-500 mt-1">Parsing IFC storeys, placements, geometry, and conversion metadata.</div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 flex gap-3">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm">Import failed</div>
                <div className="text-xs mt-1 leading-relaxed">{error}</div>
              </div>
            </div>
          )}

          {session && (
            <div className="space-y-5">
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-cyan-700">
                    <FileCode2 size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-sm text-slate-900 truncate">{session.fileName}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {(session.fileSize / (1024 * 1024)).toFixed(2)} MB
                      {session.schema ? ` . ${session.schema}` : ''}
                    </div>
                  </div>
                </div>
                <div className={`px-3 py-1.5 rounded-full text-xs font-black border ${session.conversion.canConvert ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                  {session.conversion.canConvert ? 'Conversion Ready' : 'Needs IFC Elements'}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Levels" value={session.conversion.stats.levels} />
                <Stat label="Native" value={session.conversion.stats.nativeElements} />
                <Stat label="Generic" value={session.conversion.stats.genericElements} />
                <Stat label="Warnings" value={warningCount + errorCount} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-2xl p-4">
                  <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">Supported Native Classes</div>
                  <div className="flex flex-wrap gap-1.5">
                    {supportedCategories.map(category => (
                      <span key={category} className="px-2 py-1 rounded-md bg-slate-100 text-[11px] font-semibold text-slate-600">
                        {category}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-2xl p-4">
                  <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">Conversion Log</div>
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {session.logs.slice(0, 8).map((item, index) => (
                      <div key={`${item.code}-${index}`} className="flex items-start gap-2 text-xs">
                        {item.level === 'info' ? (
                          <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle size={14} className={item.level === 'error' ? 'text-red-600 shrink-0 mt-0.5' : 'text-amber-600 shrink-0 mt-0.5'} />
                        )}
                        <div>
                          <span className="font-bold text-slate-700">{item.code}</span>
                          <span className="text-slate-500"> . {item.message}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-100 flex justify-between gap-3 shrink-0">
          <button onClick={() => { reset(); onClose(); }} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors">
            Cancel
          </button>
          <div className="flex gap-3">
            {session && (
              <button onClick={reset} className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-sm transition-colors">
                Choose Another
              </button>
            )}
            <button
              onClick={() => session && onSessionReady(session)}
              disabled={!session || isLoading}
              className="px-5 py-2.5 bg-cyan-700 hover:bg-cyan-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-black rounded-xl text-sm transition-colors"
            >
              Review in Design Copilot
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
