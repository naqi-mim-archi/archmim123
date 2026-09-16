import { autoPlanPayloadToArchElements } from '../autoPlanImport';
import { parseAutoPlanBrief } from '../autoPlanParser';
import { AutoPlanInferenceRequest } from '../autoPlanTypes';
import { validateAutoPlanBoundary } from '../autoPlanValidation';
import { getAutoPlanResolvedPaths, getAutoPlanStatus, runAutoPlanInference } from './runAutoPlanInference';

interface ApiRequest {
  method?: string;
  url?: string;
  body?: any;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (payload: any) => void;
}

export const routeAutoPlanApiRequest = async (
  request: ApiRequest,
  response: ApiResponse,
): Promise<boolean> => {
  const url = request.url || '';
  if (!url.startsWith('/api/auto-plan')) return false;

  if (request.method === 'GET' && url.startsWith('/api/auto-plan/health')) {
    response.json({
      ok: true,
      paths: getAutoPlanResolvedPaths(),
    });
    return true;
  }

  if (request.method === 'GET' && url.startsWith('/api/auto-plan/status')) {
    response.json({
      ok: true,
      status: await getAutoPlanStatus(),
    });
    return true;
  }

  if (request.method !== 'POST' || !url.startsWith('/api/auto-plan/generate')) {
    response.status(404).json({ error: 'Unknown Auto Plan endpoint.' });
    return true;
  }

  try {
    const body = request.body as AutoPlanInferenceRequest;
    if (!body?.boundary || !body?.briefInput) {
      response.status(400).json({ error: 'Auto Plan requires boundary and briefInput.' });
      return true;
    }

    const boundaryErrors = validateAutoPlanBoundary(body.boundary);
    if (boundaryErrors.length) {
      response.status(400).json({ error: boundaryErrors.join(' ') });
      return true;
    }

    const normalizedBrief = parseAutoPlanBrief(body.briefInput, body.boundary);
    console.info('[Auto Plan] Normalized brief', {
      residentialType: normalizedBrief.residentialType,
      rooms: normalizedBrief.rooms.map(room => `${room.type}:${room.count}`).join(', '),
      unsupported: normalizedBrief.unsupportedRequests.length,
    });

    const inferenceResponse = await runAutoPlanInference({
      ...body,
      normalizedBrief,
    });
    const converted = autoPlanPayloadToArchElements(inferenceResponse.payload);

    response.json({
      ...inferenceResponse,
      payload: {
        ...inferenceResponse.payload,
        brief: normalizedBrief,
      },
      projectElements: converted.elements,
      warnings: Array.from(new Set([...(inferenceResponse.warnings || []), ...converted.warnings])),
    });
    return true;
  } catch (error) {
    console.error('[Auto Plan] Request failed', error);
    response.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
};
