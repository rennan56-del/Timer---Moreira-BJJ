import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { watch } from 'node:fs';
const root = path.resolve(import.meta.dirname, '../dist');
const dev = process.argv.includes('--dev');
const project = path.resolve(import.meta.dirname, '..');
if (dev) {
  const result = spawnSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit', cwd: path.resolve(import.meta.dirname, '..') });
  if (result.status) process.exit(result.status);
}
const port = Number(process.env.PORT || (dev ? 5173 : 4173));
if (dev) {
  let pending;
  const rebuild = () => { clearTimeout(pending); pending = setTimeout(() => {
    const result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: project, stdio: 'inherit' });
    if (!result.status) console.log('Arquivos atualizados. Recarregue a página.');
  }, 180); };
  for (const folder of ['src','public']) watch(path.join(project,folder), { recursive: true }, rebuild);
  for (const file of ['index.html','scripts/sw-template.js']) watch(path.join(project,file), rebuild);
}
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.webmanifest':'application/manifest+json', '.ttf':'font/ttf', '.webp':'image/webp', '.avif':'image/avif', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    await stat(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'" });
    const body = await readFile(file);
    res.end(dev && path.extname(file) === '.html' ? body.toString().replace('<head>', '<head><meta name="moreira-development" content="true"/>') : body);
  } catch { res.writeHead(404).end('Arquivo não encontrado. Execute npm run build.'); }
});
server.on('error', error => { console.error(`Não foi possível abrir o servidor local: ${error.message}`); process.exitCode = 1; });
server.listen(port, '0.0.0.0', () => console.log(`MOREIRA BJJ TIMER — http://localhost:${port}${dev ? ' (desenvolvimento; recarregue após editar)' : ''}`));
