import type { IncomingMessage, ServerResponse } from 'node:http';
import { runGatedApiRequest, type ApiDispatch, type ApiResponseLike } from './apiGateway';
import { routeRevitExportApiRequest } from './revitExport/backend/revitExportApiRoutes';
import { ApsRevitExportBackend } from './revitExport/backend/apsRevitExportBackend';
import { routeApsRevitImportApiRequest } from './apsRevitImport/backend/apsRevitImportApiRoutes';
import { ApsRevitImportBackend } from './apsRevitImport/backend/apsRevitImportBackend';
import { routeAutoPlanApiRequest } from './autoPlan/backend/routes';
import { routeSmartText2PlanApiRequest } from './smartText2planBackend';
import { routeText2PlanApiRequest } from './text2planBackend';
import { routeText4dApiRequest } from './text4dBackend';
import { routeText4eApiRequest } from './text4eBackend';
import { routeText4fApiRequest } from './text4fBackend';
import { routeText4gApiRequest } from './text4gBackend';
import { routeText4hApiRequest } from './text4hBackend';
import { routeText4jApiRequest } from './text4jBackend';
import { routeAiRenderApiRequest } from './aiRender/backend';

// One catch-all function serves every /api route (Vercel Hobby: max 12 functions).
// vercel.json rewrites /api/(.*) to /api?__path=/api/$1. Mirrors the dispatch in vite.config.js.
// Source file: edit this, never the bundled api/index.js.

let revitExportBackend: ApsRevitExportBackend | null = null;
let apsRevitImportBackend: ApsRevitImportBackend | null = null;

const dispatch: ApiDispatch = async (gated, response) => {
  const url = String(gated.url || '');
  const request = { method: gated.method, url, body: gated.body };
  if (url.startsWith('/api/exports/revit')) {
    revitExportBackend ||= new ApsRevitExportBackend();
    return routeRevitExportApiRequest(request, response, revitExportBackend);
  }
  if (url.startsWith('/api/imports/aps-revit')) {
    apsRevitImportBackend ||= new ApsRevitImportBackend();
    return routeApsRevitImportApiRequest(request, response, apsRevitImportBackend);
  }
  if (url.startsWith('/api/auto-plan')) return routeAutoPlanApiRequest(request, response);
  if (url.startsWith('/api/smart-text2plan')) return routeSmartText2PlanApiRequest(request, response);
  if (url.startsWith('/api/text4j')) return routeText4jApiRequest(request, response);
  if (url.startsWith('/api/text4h')) return routeText4hApiRequest(request, response);
  if (url.startsWith('/api/text4g')) return routeText4gApiRequest(request, response);
  if (url.startsWith('/api/text4f')) return routeText4fApiRequest(request, response);
  if (url.startsWith('/api/text4e')) return routeText4eApiRequest(request, response);
  if (url.startsWith('/api/text4d')) return routeText4dApiRequest(request, response);
  if (url.startsWith('/api/text2plan')) return routeText2PlanApiRequest(request, response);
  if (url.startsWith('/api/ai-render')) return routeAiRenderApiRequest(request, response);
  return false;
};

const resolveUrl = (req: IncomingMessage & { query?: Record<string, any> }): string => {
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const rewrittenPath = requestUrl.searchParams.get('__path') || req.query?.__path;
  if (!rewrittenPath) return `${requestUrl.pathname}${requestUrl.search}`;
  requestUrl.searchParams.delete('__path');
  const rest = requestUrl.searchParams.toString();
  return `${rewrittenPath}${rest ? `?${rest}` : ''}`;
};

const readBody = async (req: IncomingMessage & { body?: any }): Promise<any> => {
  if (req.method !== 'POST') return undefined;
  if (req.body !== undefined) return typeof req.body === 'string' && req.body.trim() ? JSON.parse(req.body) : req.body;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.trim() ? JSON.parse(raw) : undefined;
};

export default async function handler(req: IncomingMessage & { body?: any; query?: Record<string, any> }, res: ServerResponse) {
  const sendJson = (status: number, payload: any) => {
    if (res.writableEnded) return;
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  };

  const response: ApiResponseLike = {
    status(code) {
      res.statusCode = code;
      return response;
    },
    json(payload) {
      if (res.writableEnded) return;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
    },
  };

  try {
    const url = resolveUrl(req);
    let body: any;
    try {
      body = await readBody(req);
    } catch (error) {
      sendJson(400, { error: `Invalid JSON body: ${error instanceof Error ? error.message : String(error)}` });
      return;
    }
    const handled = await runGatedApiRequest({ method: req.method, url, headers: req.headers, body }, response, dispatch);
    if (!handled) sendJson(404, { error: 'Not Found' });
  } catch (error) {
    sendJson(500, { error: error instanceof Error ? error.message : String(error) });
  }
}
