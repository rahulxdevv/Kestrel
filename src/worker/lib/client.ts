/**
 * Behind Docker, Traefik (Dokploy), Render, Caddy or Cloudflare the real address arrives in a
 * header. Getting this wrong breaks both login lock-outs and rate limiting, so resolve it in one place.
 */
export function clientIp(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || headers.get('fly-client-ip')?.trim() || 'unknown';
}

/** True when the request reached us over HTTPS, including behind a TLS-terminating proxy. */
export function isSecureRequest(headers: Headers, url: URL): boolean {
  const proto = headers.get('x-forwarded-proto');
  if (proto) return proto.split(',')[0]?.trim() === 'https';
  return url.protocol === 'https:';
}
