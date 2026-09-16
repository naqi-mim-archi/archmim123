import { autoPlanPayloadToArchElements } from './autoPlanImport';
import { AutoPlanInferenceRequest, AutoPlanInferenceResponse } from './autoPlanTypes';

export const generateAutoPlan = async (
  request: AutoPlanInferenceRequest,
): Promise<AutoPlanInferenceResponse> => {
  const response = await fetch('/api/auto-plan/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error || payload?.message || `Auto Plan failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  const result = payload as AutoPlanInferenceResponse;
  if (!result.projectElements) {
    result.projectElements = autoPlanPayloadToArchElements(result.payload).elements;
  }
  return result;
};
