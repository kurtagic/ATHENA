export interface ServerEndpoints {
  wsUrl: string; // ws(s)://host:port         → session WebSocket
  yjsUrl: string; // ws(s)://host:port/yjs    → Yjs WebsocketProvider
  httpUrl: string; // http(s)://host:port     → GET /ice
}

export const NO_SERVER_ERROR =
  'No server address configured. Set one in Settings → General.';

const DEFAULT_PORT = 8080;

/**
 * Resolve a user-entered server address into concrete endpoint URLs.
 *
 * Accepted forms: "203.0.113.7", "203.0.113.7:8080", "host", "host:8080",
 * "[2001:db8::1]:8080", bare IPv6 like "2001:db8::1" (brackets are required
 * to combine IPv6 with a port), and an optional ws://, wss://, http:// or
 * https:// prefix. Without a prefix, plain ws://http:// is used — self-hosted
 * servers are reached by raw IP and have no TLS.
 *
 * Throws with a user-facing message on empty or unparseable input.
 */
export function resolveServerEndpoints(raw: string | undefined | null): ServerEndpoints {
  const input = (raw ?? '').trim();
  if (!input) throw new Error(NO_SERVER_ERROR);

  let secure = false;
  let rest = input;
  const schemeMatch = input.match(/^(wss?|https?):\/\//i);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    secure = scheme === 'wss' || scheme === 'https';
    rest = input.slice(schemeMatch[0].length);
  }
  rest = rest.replace(/\/.*$/, ''); // strip any path

  const { host, port } = splitHostPort(rest);
  if (!host || (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535))) {
    throw new Error(`Invalid server address: "${input}"`);
  }

  // IPv6 literals need brackets inside URLs
  const hostForUrl = host.includes(':') ? `[${host}]` : host;
  // Plain connections default to the server's port 8080; secure (wss/https)
  // addresses imply a reverse proxy, so leave the standard port (443) implicit.
  const effectivePort = port ?? (secure ? null : DEFAULT_PORT);
  const authority = effectivePort === null ? hostForUrl : `${hostForUrl}:${effectivePort}`;
  const ws = secure ? 'wss' : 'ws';
  const http = secure ? 'https' : 'http';

  try {
    // eslint-disable-next-line no-new
    new URL(`${http}://${authority}`);
  } catch {
    throw new Error(`Invalid server address: "${input}"`);
  }

  return {
    wsUrl: `${ws}://${authority}`,
    yjsUrl: `${ws}://${authority}/yjs`,
    httpUrl: `${http}://${authority}`,
  };
}

/** Returns a user-facing error message, or null when the address is usable. */
export function validateServerAddress(raw: string): string | null {
  try {
    resolveServerEndpoints(raw);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function splitHostPort(s: string): { host: string; port: number | null } {
  // Bracketed IPv6: [::1] or [::1]:8080
  const bracket = s.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (bracket) {
    return { host: bracket[1], port: bracket[2] ? Number(bracket[2]) : null };
  }
  // Bare IPv6 (two or more colons): the whole string is the host
  if ((s.match(/:/g) ?? []).length >= 2) {
    return { host: s, port: null };
  }
  const i = s.indexOf(':');
  if (i === -1) return { host: s, port: null };
  return { host: s.slice(0, i), port: Number(s.slice(i + 1)) };
}
