import { getFirebaseAuth, isFirebaseConfigured } from './firebaseConfig';

// Wraps window.fetch once so every same-origin /api/* call carries the Firebase ID token,
// instead of editing each fetch('/api/…') call site. Callers still receive the original response.

export const API_AUTH_REQUIRED_EVENT = 'archai-api-auth-required';
export const TOKENS_REQUIRED_EVENT = 'archai-tokens-required';

const INSTALLED_FLAG = '__archaiApiAuthInterceptorInstalled';

const newRequestId = () => `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const resolveUrl = (input: RequestInfo | URL): URL | null => {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return new URL(raw, window.location.href);
  } catch {
    return null;
  }
};

const isOwnApiRequest = (input: RequestInfo | URL): boolean => {
  const url = resolveUrl(input);
  return !!url && url.origin === window.location.origin && url.pathname.startsWith('/api/');
};

const getIdToken = async (forceRefresh = false): Promise<string | null> => {
  const auth = getFirebaseAuth();
  // On page load the persisted session isn't restored yet; without this, early calls would go out unsigned.
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch {
    return null;
  }
};

export const installApiAuthInterceptor = () => {
  if (!isFirebaseConfigured || typeof window === 'undefined') return;
  const w = window as any;
  if (w[INSTALLED_FLAG]) return; // idempotent (StrictMode, HMR)
  w[INSTALLED_FLAG] = true;

  const originalFetch = window.fetch.bind(window);

  const withAuth = (input: RequestInfo | URL, init: RequestInit | undefined, token: string | null, requestId: string): [RequestInfo | URL, RequestInit | undefined] => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Request-Id', requestId);
    if (input instanceof Request && !init) return [new Request(input, { headers }), undefined];
    return [input, { ...init, headers }];
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isOwnApiRequest(input)) return originalFetch(input, init);

    const requestId = newRequestId(); // fresh per call; the server uses it as the charge idempotency key
    let response = await originalFetch(...withAuth(input, init, await getIdToken(), requestId));

    // Retry once with a force-refreshed token (not for Request inputs: their body is already consumed).
    if (response.status === 401 && !(input instanceof Request) && getFirebaseAuth().currentUser) {
      const refreshed = await getIdToken(true);
      if (refreshed) response = await originalFetch(...withAuth(input, init, refreshed, requestId));
    }

    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent(API_AUTH_REQUIRED_EVENT));
    } else if (response.status === 402) {
      response.clone().json()
        .then((body: any) => window.dispatchEvent(new CustomEvent(TOKENS_REQUIRED_EVENT, {
          detail: { required: body?.required, balance: body?.balance, reason: body?.reason },
        })))
        .catch(() => window.dispatchEvent(new CustomEvent(TOKENS_REQUIRED_EVENT, { detail: {} })));
    }
    return response;
  };
};
