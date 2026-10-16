// ============================================================
// O servidor do teste no iPhone: faz o papel do nginx de produção.
//   /api/*  -> a API simulada, com o projeto sintético (dados.mjs);
//   o resto -> o Next (next dev na porta 3000).
// Guarda tudo o que a página relatou (o registro de erros do aparelho em
// /api/health/erro e o relatório da prévia) e os pedidos à API; o roteiro
// do Safari lê em /__relatos.
// ============================================================

import http from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { ID, projeto, transcricao, versao } from './dados.mjs';

const VIDEO = process.env.VIDEO ?? 'proxy.mp4';
const relatos = { erros: [], previa: [], pedidos: [] };

const json = (res, corpo, status = 200) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(corpo));
};
const lerCorpo = (req) => new Promise((ok) => {
  let t = '';
  req.on('data', (c) => (t += c));
  req.on('end', () => ok(t));
});

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/__relatos') return json(res, relatos);
    if (!url.pathname.startsWith('/api/')) {
      // O resto vai ao Next.
      const p = http.request({ host: '127.0.0.1', port: Number(process.env.PORTA_DO_NEXT ?? 3000), path: req.url, method: req.method, headers: req.headers }, (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      });
      p.on('error', () => json(res, { erro: 'next fora' }, 502));
      req.pipe(p);
      return;
    }
    const c = url.pathname.replace(/^\/api/, '');
    const corpo = req.method === 'GET' ? '' : await lerCorpo(req);
    relatos.pedidos.push(`${req.method} ${c}`);
    if (c === '/health/erro') {
      try { relatos.erros.push(JSON.parse(corpo)); } catch { relatos.erros.push(corpo); }
      return json(res, {});
    }
    if (c === '/health/previa') {
      try { relatos.previa.push(JSON.parse(corpo)); } catch { /* ignora */ }
      return json(res, {});
    }
    if (c === '/auth/me') return json(res, { userId: 'u', workspaceId: 'w', role: 'OWNER' });
    if (c === '/projects' && req.method === 'GET') return json(res, [projeto]);
    if (c === `/projects/${ID}` && req.method === 'GET') return json(res, projeto);
    if (c.startsWith(`/projects/${ID}/edit-plans`)) return json(res, versao);
    if (c === `/projects/${ID}/transcript`) return json(res, transcricao);
    if (c === `/projects/${ID}/video`) {
      const tamanho = statSync(VIDEO).size;
      const video = readFileSync(VIDEO);
      const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
      if (m) {
        const ini = Number(m[1]);
        const fim = m[2] ? Number(m[2]) : tamanho - 1;
        res.writeHead(206, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${ini}-${fim}/${tamanho}`, 'Content-Length': String(fim - ini + 1) });
        return res.end(video.subarray(ini, fim + 1));
      }
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': String(tamanho) });
      return res.end(video);
    }
    if (c === '/brand-profile') return json(res, null);
    if (c === '/reviews') return json(res, {});
    if (c.startsWith('/assets') && !c.includes('/file')) return json(res, []);
    if (c.includes('/animacoes') && req.method === 'POST') return json(res, { chave: 'x', estado: 'pronta' }, 201);
    if (req.method !== 'GET') return json(res, {});
    return json(res, { message: 'nao tem' }, 404);
  })
  .listen(8080, () => console.log('servidor do teste em http://localhost:8080'));
