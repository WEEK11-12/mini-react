import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, sep, extname } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 5173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end();
      return;
    }
    const name = pathname === '/' ? 'index.html' : pathname.slice(1);
    const path = resolve(root, name);
    const canonical = relative(root, path).split(sep).join('/');
    const allowed = ['index.html', 'styles.css', 'phase2.html', 'phase2.css', 'test/fixtures.js'].includes(canonical)
      || canonical.startsWith('src/') || canonical.startsWith('test/browser/');
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep) || !allowed || !mime[extname(path)]) {
      response.writeHead(404).end('Not found');
      return;
    }
    const body = await readFile(path);
    response.writeHead(200, { 'Content-Type': mime[extname(path)], 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 400).end('Request failed');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`mini-react: http://localhost:${port}`));
