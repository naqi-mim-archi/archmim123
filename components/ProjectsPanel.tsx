import React, { useCallback, useEffect, useState } from 'react';
import { Cloud, FolderOpen, Loader2, Save, Trash2, X } from 'lucide-react';
import type { Project } from '../types';
import {
  ConcurrentEditError,
  deleteProject,
  listProjects,
  loadProjectWithRole,
  saveProject,
  StorageLimitError,
  type CloudProjectSummary,
} from '../services/firebase/projectsService';
import { canDelete, canEdit, canShare, type ProjectRole } from '../services/firebase/shareAccess';
import { renderProjectThumbnail } from '../services/firebase/projectThumbnail';
import { getFirebaseAuthErrorMessage } from '../services/firebase/authService';

interface ProjectsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string | null;
  userName?: string | null;
  userEmail?: string | null;
  currentProject: Project | null;
  currentProjectId: string | null;
  currentProjectRole?: ProjectRole;
  currentProjectLoadedAtMs?: number | null;
  onSaved: (projectId: string, updatedAtMs?: number | null) => void;
  onOpenProject: (project: Project, projectId: string, role?: ProjectRole, updatedAtMs?: number | null) => void;
  // Saving under a new name renames the open project too, so the title bar agrees with the list.
  onRenameProject?: (name: string) => void;
}

const sectionLabel = 'text-[10px] font-bold text-slate-400 uppercase tracking-widest';

const formatDate = (date: Date | null) =>
  date ? `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}` : '';

const describeError = (err: any) => {
  if (err instanceof StorageLimitError) return err.message;
  // Keep the Firebase code visible: "permission denied" and "offline" read the same otherwise.
  const code = typeof err?.code === 'string' ? err.code : null;
  const message = err?.message ? String(err.message).replace(/^Firebase:\s*/, '') : String(err);
  if (code?.startsWith('auth/')) return getFirebaseAuthErrorMessage(err);
  return code ? `${message} [${code}]` : message;
};

const ProjectsPanel: React.FC<ProjectsPanelProps> = ({
  isOpen, onClose, uid, userName, userEmail, currentProject, currentProjectId,
  currentProjectRole, currentProjectLoadedAtMs, onSaved, onOpenProject, onRenameProject,
}) => {
  const [projects, setProjects] = useState<CloudProjectSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Someone else saved while this copy was open: the user chooses what happens next.
  const [conflict, setConflict] = useState<{ editorName: string } | null>(null);
  // Saving always asks for a name first (pre-filled with the current one).
  const [nameDraft, setNameDraft] = useState<string | null>(null);

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
      setNameDraft(null);
      return;
    }
    setProjects(null);
    void refresh();
  }, [isOpen, refresh]);

  if (!isOpen || !uid) return null;

  const isUpdate = !!currentProjectId && !!projects?.some(project => project.id === currentProjectId);
  const isViewerOnCurrent = !!currentProjectId && currentProjectRole != null && !canEdit(currentProjectRole);

  const save = async (options: { force?: boolean; asCopy?: boolean; name?: string } = {}) => {
    if (!currentProject || !uid) return;
    const chosenName = (options.name ?? nameDraft ?? currentProject.name ?? 'Untitled Plan').trim() || 'Untitled Plan';
    setBusy('save');
    setError(null);
    setNotice(null);
    try {
      const { projectId } = await saveProject(uid, { ...currentProject, name: chosenName }, {
        projectId: options.asCopy ? null : currentProjectId,
        name: options.asCopy ? `${chosenName} (copy)` : chosenName,
        thumbnailDataUrl: renderProjectThumbnail(currentProject),
        expectedUpdatedAtMs: options.force || options.asCopy ? null : currentProjectLoadedAtMs ?? null,
        editorName: userName || 'Someone',
        ownerEmail: userEmail || null,
      });
      setConflict(null);
      if (!options.asCopy && chosenName !== currentProject.name) onRenameProject?.(chosenName);
      setNameDraft(null);
      onSaved(projectId, Date.now());
      setNotice(options.asCopy ? 'Saved as a new copy.' : isUpdate ? 'Project updated.' : 'Project saved to your account.');
      await refresh();
    } catch (err) {
      if (err instanceof ConcurrentEditError) setConflict({ editorName: err.editorName });
      else setError(describeError(err));
    } finally {
      setBusy(null);
    }
  };

  // Step 1: ask for the name. Step 2 (the confirm button below) does the save.
  const handleSave = () => setNameDraft(currentProject?.name || 'Untitled Plan');

  const handleOpen = async (summary: CloudProjectSummary) => {
    setBusy(summary.id);
    setError(null);
    setConflict(null);
    try {
      const loaded = await loadProjectWithRole(uid, summary.id);
      onOpenProject(loaded.project, summary.id, loaded.role, loaded.updatedAtMs);
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
          {currentProject && !isViewerOnCurrent && nameDraft === null && (
            <button
              onClick={handleSave}
              disabled={!!busy}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isUpdate ? `Save changes to "${currentProject.name || 'Untitled Plan'}"` : 'Save current project'}
            </button>
          )}

          {currentProject && !isViewerOnCurrent && nameDraft !== null && (
            <div className="space-y-2">
              <div className={sectionLabel}>Project name</div>
              <input
                autoFocus
                value={nameDraft}
                maxLength={200}
                onChange={e => setNameDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void save();
                  if (e.key === 'Escape') { e.stopPropagation(); setNameDraft(null); }
                }}
                placeholder="Untitled Plan"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setNameDraft(null)}
                  disabled={!!busy}
                  className="flex-1 py-3 bg-white border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void save()}
                  disabled={!!busy}
                  className="flex-[2] py-3 bg-slate-900 text-white rounded-2xl font-bold text-sm hover:bg-slate-800 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isUpdate ? 'Save' : 'Save to my account'}
                </button>
              </div>
              {isUpdate && (
                <p className="text-[10px] font-medium text-slate-400">
                  Changing the name here renames the saved project.
                </p>
              )}
            </div>
          )}

          {currentProject && isViewerOnCurrent && (
            <button
              onClick={() => save({ asCopy: true })}
              disabled={!!busy}
              className="w-full py-4 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold hover:bg-slate-50 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Duplicate to my account
            </button>
          )}

          {conflict && (
            <div className="space-y-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              <p>{conflict.editorName} saved changes to this project after you opened it. Saving now would replace their version.</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => save({ force: true })} disabled={!!busy} className="px-3 py-1.5 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700 disabled:opacity-50">Overwrite anyway</button>
                <button onClick={() => save({ asCopy: true })} disabled={!!busy} className="px-3 py-1.5 rounded-xl bg-white border border-amber-200 font-bold hover:bg-amber-100/60 disabled:opacity-50">Save as a copy</button>
                <button onClick={() => { setConflict(null); void handleOpen({ id: currentProjectId! } as CloudProjectSummary); }} disabled={!!busy} className="px-3 py-1.5 rounded-xl bg-white border border-amber-200 font-bold hover:bg-amber-100/60 disabled:opacity-50">Reload theirs</button>
              </div>
            </div>
          )}

          {notice && <div className="text-xs font-medium text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">{notice}</div>}
          {error && <div className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>}

          <div className={sectionLabel}>Saved projects</div>
          {projects === null ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></div>
          ) : projects.length === 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-400">No floorplan projects saved yet.</p>
              <p className="text-[10px] font-medium text-slate-400">
                Saved render canvases are separate: open the Render Canvas and use its Sessions button.
              </p>
            </div>
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
                      <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1.5">
                        <span>{formatDate(summary.updatedAt)}</span>
                        {summary.role !== 'owner' && (
                          <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold">
                            {summary.role === 'editor' ? 'Shared · can edit' : 'Shared · view'}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  <div className="px-3 pb-2 pt-1 flex justify-end">
                    {!canDelete(summary.role) ? null : confirmDeleteId === summary.id ? (
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
