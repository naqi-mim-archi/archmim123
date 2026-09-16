import { getFirebaseProjectId } from './adminApp';
import { verifyFirebaseIdToken, IdTokenError, type VerifiedIdToken } from './verifyIdToken';

export type ApiAuthFailure = 'no-token' | 'invalid-token' | 'server-unconfigured';

export interface ApiAuthResult {
  user: VerifiedIdToken | null;
  failure: ApiAuthFailure | null;
  message?: string;
}

const readBearerToken = (headers: Record<string, string | string[] | undefined> | undefined): string | null => {
  const raw = headers?.authorization ?? headers?.Authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const match = /^Bearer\s+(.+)$/i.exec(String(value || '').trim());
  return match ? match[1].trim() : null;
};

// A server that cannot verify tokens answers 503 (server-unconfigured), not 401, so the two stay diagnosable.
export const verifyApiRequest = async (req: { headers?: Record<string, string | string[] | undefined> }): Promise<ApiAuthResult> => {
  const token = readBearerToken(req.headers);
  if (!token) return { user: null, failure: 'no-token' };

  const projectId = getFirebaseProjectId();
  if (!projectId) {
    return { user: null, failure: 'server-unconfigured', message: 'FIREBASE_PROJECT_ID is not set on the server.' };
  }

  try {
    return { user: await verifyFirebaseIdToken(token, projectId), failure: null };
  } catch (err: any) {
    if (err instanceof IdTokenError) return { user: null, failure: 'invalid-token', message: err.message };
    // Could not reach Google's certificate endpoint etc.
    return { user: null, failure: 'server-unconfigured', message: err?.message || String(err) };
  }
};
