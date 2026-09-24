import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  for (const [key, value] of Object.entries(env)) {
    const isServerKey = ['APS_', 'UNIFIED_RENDERER_', 'FIREBASE_', 'VITE_FIREBASE_', 'STRIPE_', 'GOOGLE_VERTEX_'].some(prefix => key.startsWith(prefix))
      || ['APP_BASE_URL', 'ALLOW_ANONYMOUS_API', 'ALLOW_UNMETERED_API', 'RESEND_API_KEY', 'INVITE_FROM_EMAIL', 'INVITE_MAIL_COLLECTION'].includes(key);
    if (isServerKey && value && !process.env[key]) process.env[key] = value;
  }
  const buildTimestamp = new Date().toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short'
  });
  let revitExportBackend = null;
  let apsRevitImportBackend = null;

  const readJsonBody = (request) => new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', chunk => {
      raw += chunk;
    });
    request.on('end', () => {
      if (!raw.trim()) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });

  return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        warmup: {
          clientFiles: [
            './index.html',
            './App.tsx',
            './components/generative-wizard/GenerativeWizardCore.tsx',
          ],
        },
      },
    plugins: [{
      name: 'archai-revit-export-dev-api',
      configureServer(server) {
        let text2PlanBackendModulePromise;
        const loadText2PlanBackend = () => {
          text2PlanBackendModulePromise ||= server.ssrLoadModule('/services/text2planBackend.ts');
          return text2PlanBackendModulePromise;
        };
        let text4dBackendModulePromise;
        const loadText4dBackend = () => {
          text4dBackendModulePromise ||= server.ssrLoadModule('/services/text4dBackend.ts');
          return text4dBackendModulePromise;
        };
        let text4eBackendModulePromise;
        const loadText4eBackend = () => {
          text4eBackendModulePromise ||= server.ssrLoadModule('/services/text4eBackend.ts');
          return text4eBackendModulePromise;
        };
        let text4fBackendModulePromise;
        const loadText4fBackend = () => {
          text4fBackendModulePromise ||= server.ssrLoadModule('/services/text4fBackend.ts');
          return text4fBackendModulePromise;
        };
        let text4gBackendModulePromise;
        const loadText4gBackend = () => {
          text4gBackendModulePromise ||= server.ssrLoadModule('/services/text4gBackend.ts');
          return text4gBackendModulePromise;
        };
        let text4hBackendModulePromise;
        const loadText4hBackend = () => {
          text4hBackendModulePromise ||= server.ssrLoadModule('/services/text4hBackend.ts');
          return text4hBackendModulePromise;
        };
        let text4jBackendModulePromise;
        const loadText4jBackend = () => {
          text4jBackendModulePromise ||= server.ssrLoadModule('/services/text4jBackend.ts');
          return text4jBackendModulePromise;
        };
        let aiRenderBackendModulePromise;
        const loadAiRenderBackend = () => {
          aiRenderBackendModulePromise ||= server.ssrLoadModule('/services/aiRender/backend.ts');
          return aiRenderBackendModulePromise;
        };

        server.watcher.on('change', file => {
          const normalizedFile = file.replaceAll('\\', '/');
          if (normalizedFile.includes('/services/text2planBackend.ts') || normalizedFile.includes('/services/text4c')) {
            text2PlanBackendModulePromise = undefined;
          }
          if (normalizedFile.includes('/services/text4dBackend.ts') || normalizedFile.includes('/services/text4d')) {
            text4dBackendModulePromise = undefined;
          }
          if (normalizedFile.includes('/services/text4eBackend.ts') || normalizedFile.includes('/services/text4e')) {
            text4eBackendModulePromise = undefined;
          }
          if (normalizedFile.includes('/services/text4fBackend.ts') || normalizedFile.includes('/services/text4f')) {
            text4fBackendModulePromise = undefined;
          }
          if (normalizedFile.includes('/services/text4gBackend.ts') || normalizedFile.includes('/services/text4g')) {
            text4gBackendModulePromise = undefined;
          }
          if (normalizedFile.includes('/services/text4hBackend.ts') || normalizedFile.includes('/services/text4h')) {
            text4hBackendModulePromise = undefined;
          }
          if (normalizedFile.includes('/services/text4jBackend.ts') || normalizedFile.includes('/services/text4j')) {
            text4jBackendModulePromise = undefined;
          }
          if (normalizedFile.includes('/services/aiRender')) {
            aiRenderBackendModulePromise = undefined;
          }
        });

        server.httpServer?.once('listening', () => {
          // On-demand lazy loading: Backend modules load instantly when an API request is made
        });
        server.middlewares.use(async (request, response, next) => {
          // Stripe signs the raw bytes, and Stripe has no Firebase token: handled before the JSON body parser and the auth gate.
          if (request.url?.split('?')[0] === '/api/stripe-webhook') {
            if (request.method !== 'POST') {
              response.statusCode = 405;
              response.end();
              return;
            }
            try {
              const chunks = [];
              for await (const chunk of request) chunks.push(Buffer.from(chunk));
              const { handleStripeWebhook } = await server.ssrLoadModule('/services/billing/stripeWebhook.ts');
              const result = await handleStripeWebhook(Buffer.concat(chunks), request.headers['stripe-signature']);
              response.statusCode = result.status;
              response.setHeader('Content-Type', 'application/json');
              response.end(JSON.stringify(result.body));
            } catch (error) {
              response.statusCode = 500;
              response.setHeader('Content-Type', 'application/json');
              response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
            return;
          }
          const isBillingRequest = request.url?.startsWith('/api/billing/');
          const isShareRequest = request.url?.startsWith('/api/share/');
          const isRevitExportRequest = request.url?.startsWith('/api/exports/revit');
          const isApsRevitImportRequest = request.url?.startsWith('/api/imports/aps-revit');
          const isAutoPlanRequest = request.url?.startsWith('/api/auto-plan');
          const isText2PlanRequest = request.url?.startsWith('/api/text2plan');
          const isText4dRequest = request.url?.startsWith('/api/text4d');
          const isText4eRequest = request.url?.startsWith('/api/text4e');
          const isText4fRequest = request.url?.startsWith('/api/text4f');
          const isText4gRequest = request.url?.startsWith('/api/text4g');
          const isText4hRequest = request.url?.startsWith('/api/text4h');
          const isText4jRequest = request.url?.startsWith('/api/text4j');
          const isSmartText2PlanRequest = request.url?.startsWith('/api/smart-text2plan');
          const isAiRenderRequest = request.url?.startsWith('/api/ai-render');
          if (!isBillingRequest && !isShareRequest && !isRevitExportRequest && !isApsRevitImportRequest && !isAutoPlanRequest && !isText2PlanRequest && !isText4dRequest && !isText4eRequest && !isText4fRequest && !isText4gRequest && !isText4hRequest && !isText4jRequest && !isSmartText2PlanRequest && !isAiRenderRequest) {
            next();
            return;
          }

          try {
            const body = request.method === 'POST' ? await readJsonBody(request) : undefined;
            const apiResponse = {
              status(code) {
                response.statusCode = code;
                return apiResponse;
              },
              json(payload) {
                response.setHeader('Content-Type', 'application/json');
                response.end(JSON.stringify(payload));
              },
            };
            const dispatch = async (gated, apiResponse) => {
            let handled = false;
            if (isRevitExportRequest) {
              const [{ routeRevitExportApiRequest }, { ApsRevitExportBackend }] = await Promise.all([
                server.ssrLoadModule('/services/revitExport/backend/revitExportApiRoutes.ts'),
                server.ssrLoadModule('/services/revitExport/backend/apsRevitExportBackend.ts'),
              ]);
              revitExportBackend ||= new ApsRevitExportBackend();
              handled = await routeRevitExportApiRequest({
                method: gated.method,
                url: gated.url,
                body: gated.body,
              }, apiResponse, revitExportBackend);
            } else if (isApsRevitImportRequest) {
              const [{ routeApsRevitImportApiRequest }, { ApsRevitImportBackend }] = await Promise.all([
                server.ssrLoadModule('/services/apsRevitImport/backend/apsRevitImportApiRoutes.ts'),
                server.ssrLoadModule('/services/apsRevitImport/backend/apsRevitImportBackend.ts'),
              ]);
              apsRevitImportBackend ||= new ApsRevitImportBackend();
              handled = await routeApsRevitImportApiRequest({
                method: gated.method,
                url: gated.url,
                body: gated.body,
              }, apiResponse, apsRevitImportBackend);
            } else if (isAutoPlanRequest) {
              const { routeAutoPlanApiRequest } = await server.ssrLoadModule('/services/autoPlan/backend/routes.ts');
              handled = await routeAutoPlanApiRequest({
                method: gated.method,
                url: gated.url,
                body: gated.body,
              }, apiResponse);
            } else if (isSmartText2PlanRequest) {
              const { routeSmartText2PlanApiRequest } = await server.ssrLoadModule('/services/smartText2planBackend.ts');
              handled = await routeSmartText2PlanApiRequest({
                method: gated.method,
                url: gated.url,
                body: gated.body,
              }, apiResponse);
            } else if (isText4jRequest) {
              const { routeText4jApiRequest } = await loadText4jBackend();
              handled = await routeText4jApiRequest({
                method: gated.method,
                url: gated.url,
                body: gated.body,
              }, apiResponse);
            } else if (isText4hRequest) {
              const { routeText4hApiRequest } = await loadText4hBackend();
              handled = await routeText4hApiRequest({
                method: gated.method,
                url: gated.url,
                body: gated.body,
              }, apiResponse);
            } else if (isText4gRequest) {
              const { routeText4gApiRequest } = await loadText4gBackend();
              handled = await routeText4gApiRequest({
                method: gated.method,
                url: gated.url,
                body: gated.body,
              }, apiResponse);
            } else if (isText4fRequest) {
              const { routeText4fApiRequest } = await loadText4fBackend();
              handled = await routeText4fApiRequest({
                method: gated.method,
                url: gated.url,
                body: gated.body,
              }, apiResponse);
            } else if (isText4eRequest) {
              const { routeText4eApiRequest } = await loadText4eBackend();
              handled = await routeText4eApiRequest({
                method: gated.method,
                url: gated.url,
                body: gated.body,
              }, apiResponse);
            } else if (isText4dRequest) {
              const { routeText4dApiRequest } = await loadText4dBackend();
              handled = await routeText4dApiRequest({
                method: gated.method,
                url: gated.url,
                body: gated.body,
              }, apiResponse);
            } else if (isText2PlanRequest) {
              const { routeText2PlanApiRequest } = await loadText2PlanBackend();
              handled = await routeText2PlanApiRequest({
                method: gated.method,
                url: gated.url,
                body: gated.body,
              }, apiResponse);
            } else if (isAiRenderRequest) {
              const { routeAiRenderApiRequest } = await loadAiRenderBackend();
              handled = await routeAiRenderApiRequest({
                method: gated.method,
                url: gated.url,
                body: gated.body,
              }, apiResponse);
            }
            return handled;
            };
            // Auth gate, token charge/refund and job ownership (shared with the Vercel handler).
            const { runGatedApiRequest } = await server.ssrLoadModule('/services/apiGateway.ts');
            const handled = await runGatedApiRequest({
              method: request.method,
              url: request.url,
              headers: request.headers,
              body,
            }, apiResponse, dispatch);
            if (!handled && !response.writableEnded) next();
          } catch (error) {
            if (!response.writableEnded) {
              response.statusCode = 500;
              response.setHeader('Content-Type', 'application/json');
              response.end(JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }));
            }
          }
        });
      },
    }],
    define: {
      'import.meta.env.VITE_BUILD_TIMESTAMP': JSON.stringify(buildTimestamp),
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GOOGLE_MAPS_PLATFORM_KEY': JSON.stringify(env.GOOGLE_MAPS_PLATFORM_KEY || ''),
    },
  };
});
