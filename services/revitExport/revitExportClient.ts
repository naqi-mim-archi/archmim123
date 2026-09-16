import {
  RevitExportJobResponse,
  RevitExportEngineInfo,
  RevitExportManifest,
  RevitExportStartRequest,
} from './revitExportTypes';

const jsonFetch = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Revit export request failed with ${response.status}`);
  }
  return payload as T;
};

export const startRevitExportJob = async (manifest: RevitExportManifest): Promise<RevitExportJobResponse> => {
  const request: RevitExportStartRequest = {
    projectId: manifest.project.id,
    levelScope: 'all',
    selectedLevelIds: manifest.levels.map(level => level.id),
    includeFurniture: manifest.settings.includeFurniture,
    includeAnnotations: manifest.settings.includeAnnotations,
    includeUnsupportedAsDirectShape: manifest.settings.includeUnsupportedAsDirectShape,
    revitEngine: manifest.settings.revitEngine,
    manifest,
  };
  return jsonFetch<RevitExportJobResponse>('/api/exports/revit', {
    method: 'POST',
    body: JSON.stringify(request),
  });
};

export const getRevitExportJobStatus = async (jobId: string): Promise<RevitExportJobResponse> => (
  jsonFetch<RevitExportJobResponse>(`/api/exports/revit/${encodeURIComponent(jobId)}`)
);

export const getRevitExportDownloadUrls = async (jobId: string): Promise<{ downloadUrl: string; reportUrl: string | null }> => (
  jsonFetch<{ downloadUrl: string; reportUrl: string | null }>(`/api/exports/revit/${encodeURIComponent(jobId)}/download`)
);

export const getRevitExportEngines = async (): Promise<{ engines: RevitExportEngineInfo[] }> => (
  jsonFetch<{ engines: RevitExportEngineInfo[] }>('/api/exports/revit/engines')
);
