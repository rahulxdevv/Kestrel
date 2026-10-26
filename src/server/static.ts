import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Serves the built dashboard and tracker from disk. This is the Node equivalent of the Workers
 * static-assets binding (`c.env.ASSETS.fetch`), so the request handlers stay identical.
 */
export function diskAssets(rootDir: string) {
  const root = resolve(rootDir);

  async function read(file: string): Promise<ArrayBuffer | null> {
    try {
      const full = resolve(join(root, normalize(file).replace(/^([/\\])+/, '')));
      // Never escape the asset directory.
      if (full !== root && !full.startsWith(root + sep)) return null;
      const info = await stat(full);
      if (!info.isFile()) return null;
      const buf = await readFile(full);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    } catch {
      return null;
    }
  }

  function headersFor(path: string, size?: number) {
    const ext = extname(path).toLowerCase();
    const headers: Record<string, string> = { 'content-type': TYPES[ext] ?? 'application/octet-stream' };
    if (size !== undefined) headers['content-length'] = String(size);
    if (path.startsWith('/assets/')) headers['cache-control'] = 'public, max-age=31536000, immutable';
    else if (path.startsWith('/js/')) headers['cache-control'] = 'public, max-age=3600';
    else if (ext === '.html') headers['cache-control'] = 'no-cache';
    else headers['cache-control'] = 'public, max-age=3600';
    if (ext === '.js') headers['access-control-allow-origin'] = '*';
    return headers;
  }

  return {
    async fetch(input: Request | URL | string): Promise<Response> {
      const url = input instanceof Request ? new URL(input.url) : input instanceof URL ? input : new URL(input, 'http://localhost');
      let path = decodeURIComponent(url.pathname);
      if (path === '/') path = '/home.html';
      if (path.endsWith('/')) path += 'index.html';

      const direct = await read(path);
      if (direct) return new Response(direct, { status: 200, headers: headersFor(path, direct.byteLength) });

      // The dashboard is a single-page app: /app/site/... all load dist/index.html.
      const shell = await read('/index.html');
      const isSpa = path === '/app' || path.startsWith('/app/');
      if (isSpa && shell) {
        return new Response(shell, { status: 200, headers: headersFor('/index.html', shell.byteLength) });
      }
      return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    },
  };
}
