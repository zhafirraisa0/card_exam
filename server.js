import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
let port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};

const server = createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end('Method not allowed'); return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname); }
  catch { response.writeHead(400); response.end('Bad request'); return; }
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = resolve(root, requested);
  if (target !== root && !target.startsWith(root + sep)) { response.writeHead(403); response.end('Forbidden'); return; }
  try {
    const info = statSync(target);
    if (!info.isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type': types[extname(target).toLowerCase()] || 'application/octet-stream', 'Content-Length': info.size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    if (request.method === 'HEAD') response.end(); else createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Not found');
  }
});
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && port < (Number(process.env.PORT) || 3010)) {
    port += 1;
    server.listen(port, host);
    return;
  }
  console.error(`Gagal membuka server di ${host}:${port}: ${error.message}`);
  process.exitCode = 1;
});
server.on('listening', () => console.log(`School Exam Card Generator berjalan di http://${host}:${port}`));
server.listen(port, host);
