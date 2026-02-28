import { API_BASE } from '../shared/constants';

const etags = new Map<string, string>();
const cache = new Map<string, unknown>();

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

async function fetchWithETag(url: string): Promise<{ data: unknown; changed: boolean }> {
  const headers: Record<string, string> = {};
  const etag = etags.get(url);
  if (etag) {
    headers['If-None-Match'] = etag;
  }

  let resp: Response;
  try {
    resp = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new NetworkError('API request timed out');
    }
    const cause = (err as { cause?: { code?: string } }).cause;
    if (cause?.code === 'ENOTFOUND') {
      throw new NetworkError('API host unreachable (DNS failure)');
    }
    if (cause?.code === 'ECONNREFUSED' || cause?.code === 'ECONNRESET') {
      throw new NetworkError(`Connection failed (${cause.code})`);
    }
    throw new NetworkError(`Network error: ${(err as Error).message ?? err}`);
  }

  if (resp.status === 304) {
    return { data: cache.get(url) ?? null, changed: false };
  }

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} for ${url}`);
  }

  const data = await resp.json();
  const newEtag = resp.headers.get('ETag');
  if (newEtag) {
    etags.set(url, newEtag);
    cache.set(url, data);
  }
  return { data, changed: true };
}

export async function getWar() {
  return fetchWithETag(`${API_BASE}/war`);
}

export async function getMaps() {
  return fetchWithETag(`${API_BASE}/maps`);
}

export async function getDynamic(mapName: string) {
  return fetchWithETag(`${API_BASE}/maps/${mapName}/dynamic/public`);
}
