import {
  ApsRevitImportEngineInfo,
  ApsRevitImportJobResponse,
  ApsRevitImportOptions,
  ApsRevitImportStartRequest,
} from './apsRevitImportTypes';

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
    throw new Error(payload.error || payload.message || `APS Revit import request failed with ${response.status}`);
  }
  return payload as T;
};

export const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
  reader.onerror = () => reject(reader.error || new Error('Could not read RVT file.'));
  reader.readAsDataURL(file);
});

export const startApsRevitImportJob = async (
  file: File,
  options: ApsRevitImportOptions,
): Promise<ApsRevitImportJobResponse> => {
  const request: ApsRevitImportStartRequest = {
    fileName: file.name,
    fileBase64: await fileToBase64(file),
    options,
  };
  return jsonFetch<ApsRevitImportJobResponse>('/api/imports/aps-revit', {
    method: 'POST',
    body: JSON.stringify(request),
  });
};

export const getApsRevitImportJobStatus = async (jobId: string): Promise<ApsRevitImportJobResponse> => (
  jsonFetch<ApsRevitImportJobResponse>(`/api/imports/aps-revit/${encodeURIComponent(jobId)}`)
);

export const getApsRevitImportResult = async (jobId: string): Promise<ApsRevitImportJobResponse> => (
  jsonFetch<ApsRevitImportJobResponse>(`/api/imports/aps-revit/${encodeURIComponent(jobId)}/result`)
);

export const getApsRevitImportEngines = async (): Promise<{ engines: ApsRevitImportEngineInfo[] }> => (
  jsonFetch<{ engines: ApsRevitImportEngineInfo[] }>('/api/imports/aps-revit/engines')
);
