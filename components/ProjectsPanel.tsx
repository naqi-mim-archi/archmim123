import React, { useCallback, useEffect, useState } from 'react';
import { Cloud, FolderOpen, Loader2, Save, Trash2, X } from 'lucide-react';
import type { Project } from '../types';
import {
  deleteProject,
  listProjects,
  loadProject,
  saveProject,
  StorageLimitError,
  type CloudProjectSummary,
} from '../services/firebase/projectsService';
import { renderProjectThumbnail } from '../services/firebase/projectThumbnail';
import { getFirebaseAuthErrorMessage } from '../services/firebase/authService';

interface ProjectsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string | null;
  currentProject: Project | null;
  currentProjectId: string | null;
  onSaved: (projectId: string) => void;
  onOpenProject: (project: Project, projectId: string) => void;
}

const sectionLabel = 'text-[10px] font-bold text-slate-400 uppercase tracking-widest';

const formatDate = (date: Date | null) =>
  date ? `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}` : '';

const describeError = (err: any) =>
  err instanceof StorageLimitError ? err.message : err?.code ? getFirebaseAuthErrorMessage(err) : err?.message || String(err);

const ProjectsPanel: React.FC<ProjectsPanelProps> = ({ isOpen, onClose, uid, currentProject, currentProjectId, onSaved, onOpenProject }) => {
  const [projects, setProjects] = useState<CloudProjectSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!uid) return;
    try {
      setProjects(await listProjects(uid));
    } catch (err) {
      setProjects([]);
      setError(describeError(err));
    }
  }, [uid]);

  useEffect(() => {
    if (!isOpen) {
      setNotice(null);
      setError(null);
      setConfirmDeleteId(null);
      return;
    }
    setProjects(null);
    void refresh();
  }, [isOpen, refresh]);

  if (!isOpen || !uid) return null;

  const isUpdate = !!currentProjectId && !!projects?.some(project => project.id === currentProjectId);

  const handleSave = async () => {
    if (!currentProject) return;
    setBusy('save');
    setError(null);
    setNotice(null);
    try {
      const { projectId } = await saveProject(uid, currentProject, {
        projectId: currentProjectId,
        name: currentProject.name,
        thumbnailDataUrl: renderProjectThumbnail(currentProject),
      });
      onSaved(projectId);
      setNotice(isUpdate ? 'Project updated.' : 'Project saved to your account.');
      await refresh();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  };

  const handleOpen = async (summary: CloudProjectSummary) => {
    setBusy(summary.id);
    setError(null);
    try {
      onOpenProject(await loadProject(uid, summary.id), summary.id);
      onClose();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (summary: CloudProjectSummary) => {
    setBusy(`delete-${summary.id}`);
    setError(null);
    try {
      await deleteProject(uid, summary.id);
      setConfirmDeleteId(null);
      await refresh();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95" role="dialog" aria-modal="true" aria-labelledby="projects-panel-title">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 rounded-xl text-white shadow-lg shadow-slate-300">
              <Cloud size={20} />
            </div>
            <h2 id="projects-panel-title" className="text-lg font-black text-slate-900">My Projects</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          {currentProject && (
            <button
              onClick={handleSave}
              disabled={!!busy}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isUpdate ? `Save changes to "${currentProject.name || 'Untitled Plan'}"` : 'Save current project'}
            </button>
          )}

          {notice && <div className="text-xs font-medium text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">{notice}</div>}
          {error && <div className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>}

          <div className={sectionLabel}>Saved projects</div>
          {projects === null ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></div>
          ) : projects.length === 0 ? (
            <p className="text-xs font-medium text-slate-400">Nothing saved yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {projects.map(summary => (
                <div key={summary.id} className={`rounded-2xl border overflow-hidden ${summary.id === currentProjectId ? 'border-slate-900' : 'border-slate-100'}`}>
                  <button onClick={() => handleOpen(summary)} disabled={!!busy} className="block w-full text-left hover:bg-slate-50 disabled:opacity-60">
                    <div className="aspect-[8/5] bg-slate-50 flex items-center justify-center">
                      {busy === summary.id ? (
                        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                      ) : summary.thumbnailUrl ? (
                        <img src={summary.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <FolderOpen className="w-6 h-6 text-slate-300" />
                      )}
                    </div>
                    <div className="px-3 pt-2">
                      <div className="text-xs font-bold text-slate-800 truncate">{summary.name}</div>
                      <div className="text-[10px] font-medium text-slate-400">{formatDate(summary.updatedAt)}</div>
                    </div>
                  </button>
                  <div className="px-3 pb-2 pt-1 flex justify-end">
                    {confirmDeleteId === summary.id ? (
                      <div className="flex items-center gap-2">
                        <button onClick={() => setConfirmDeleteId(null)} className="text-[10px] font-bold text-slate-500 hover:underline">Cancel</button>
                        <button onClick={() => handleDelete(summary)} disabled={!!busy} className="text-[10px] font-bold text-red-600 hover:underline disabled:opacity-50">
                          {busy === `delete-${summary.id}` ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(summary.id)} className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" aria-label={`Delete ${summary.name}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectsPanel;
