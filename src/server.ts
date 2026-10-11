// Serves the scanner to the phone over HTTPS (LAN), and over plain HTTP on the computer
// running it, to grab the CSV files easily.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT, config } from './config.ts';
import { knownPrefixes, lookup, refreshSetNumbers } from './cardcluster.ts';
import { EXPORTERS } from './exporters.ts';
import { readCrops, readPhoto, ready } from './ocr.ts';
import * as queue from './queue.ts';
import type { OcrResult } from './ocr.ts';

const run = promisify(execFile);
const PUBLIC = path.join(ROOT, 'public');
const READS = path.join(config.dataDir, 'reads');
const MAX_BODY = 15 * 1024 * 1024;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------- OCR ----------

/** Keeps every successful read with its image (DEBUG_CAPTURE), to study OCR mistakes. */
function captureRead(src: string, code: string) {
  fs.mkdirSync(READS, { recursive: true });
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  fs.copyFileSync(src, path.join(READS, `${stamp}-${code}.jpg`));
  const files = fs.readdirSync(READS).sort();
  for (const f of files.slice(0, Math.max(0, files.length - config.debugCaptureKeep))) fs.rmSync(path.join(READS, f));
}

/** `photo`: whole picture (tesseract looks for the code anywhere); otherwise strips of the guide frame. */
async function ocr(dataUrls: string[], photo: boolean): Promise<OcrResult> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ygo-ocr-'));
  try {
    const files = dataUrls.map((url, i) => {
      if (typeof url !== 'string' || !url.startsWith('data:image/')) throw new HttpError(400, 'Images must be data URLs');
      const file = path.join(tmp, `${i}.jpg`);
      fs.writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
      return file;
    });
    const r = photo ? await readPhoto(files[0], knownPrefixes()) : await readCrops(files, knownPrefixes());
    if (r.code) {
      console.log(`  read ${r.code}  (raw: ${r.raw})`);
      if (config.debugCapture) captureRead(files[0], r.code);
    }
    return r;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- HTTP helpers ----------

type Res = http.ServerResponse;

function send(res: Res, status: number, body: string | Buffer, type = 'text/plain; charset=utf-8', headers: http.OutgoingHttpHeaders = {}) {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}
const json = (res: Res, status: number, body: unknown) => send(res, status, JSON.stringify(body), 'application/json; charset=utf-8');

async function readBody(req: http.IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req as AsyncIterable<Buffer>) {
    size += c.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request body too large');
    chunks.push(c);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.map': 'application/json', '.webmanifest': 'application/manifest+json',
};

function serveStatic(res: Res, urlPath: string) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.slice(1));
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found');
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream', { 'Cache-Control': 'no-cache' });
}

// ---------- routes ----------

async function handle(req: http.IncomingMessage, res: Res, { local }: { local: boolean }) {
  const url = new URL(req.url || '/', 'http://x');
  const p = url.pathname;
  const m = req.method;
  if (!local && p.startsWith('/api/')) console.log(new Date().toISOString(), req.socket.remoteAddress, m, p);

  try {
    if (p === '/api/health' && m === 'GET') return json(res, 200, { ok: true });

    if (p === '/api/lookup' && m === 'GET') {
      const r = await lookup(url.searchParams.get('code') || '');
      if ('error' in r) return json(res, 400, r);
      console.log(`  lookup ${r.code.code} → ${r.candidates.length} print(s) ${r.candidates[0]?.name ?? ''}`);
      return json(res, 200, r);
    }

    if (p === '/api/ocr' && m === 'POST') {
      const { images, photo } = await readBody(req);
      if (!Array.isArray(images) || !images.length) return json(res, 400, { error: 'No image' });
      return json(res, 200, await ocr(images.slice(0, 6), Boolean(photo)));
    }

    // Camera state + a test frame sent by the phone (phones have no console)
    if (p === '/api/diag' && m === 'POST') {
      const { frame, ...info } = await readBody(req);
      if (config.debugCapture) {
        fs.mkdirSync(config.dataDir, { recursive: true });
        fs.writeFileSync(path.join(config.dataDir, 'diag.json'), JSON.stringify(info, null, 2));
        if (typeof frame === 'string') fs.writeFileSync(path.join(config.dataDir, 'diag-frame.jpg'), Buffer.from(frame.split(',')[1] ?? '', 'base64'));
      }
      return json(res, 200, { ok: true });
    }

    if (p === '/api/queue' && m === 'GET') {
      await queue.flagAmbiguous();
      return json(res, 200, { queue: queue.all().slice(-300) });
    }
    if (p === '/api/queue' && m === 'POST') {
      try {
        return json(res, 201, await queue.add(await readBody(req)));
      } catch (e) {
        if (e instanceof queue.ValidationError) throw new HttpError(400, e.message);
        throw e;
      }
    }
    // After the import: every pending card becomes "imported"
    if (p === '/api/queue/mark-exported' && m === 'POST') {
      queue.markExported();
      return json(res, 200, { ok: true });
    }
    // Card added by hand on CardCluster
    const done = p.match(/^\/api\/queue\/([\w-]+)\/done$/);
    if (done && m === 'POST') {
      if (!queue.markExported(done[1])) throw new HttpError(404, 'Not found');
      return json(res, 200, { ok: true });
    }
    const item = p.match(/^\/api\/queue\/([\w-]+)$/);
    if (item && m === 'DELETE') {
      if (!queue.remove(item[1])) throw new HttpError(404, 'Not found');
      return json(res, 200, { ok: true });
    }

    // /export.csv (CardCluster, kept for old links) and /export/<format>.csv
    const exp = p === '/export.csv' ? ['', 'cardcluster'] : p.match(/^\/export\/(\w+)\.csv$/);
    if (exp && m === 'GET') {
      const exporter = EXPORTERS[exp[1]];
      if (!exporter) throw new HttpError(404, 'Unknown export format');
      await queue.flagAmbiguous();
      const items = queue.pending().filter(i => !(exporter.skipsAmbiguous && i.csvAmbiguous));
      const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
      return send(res, 200, exporter.toCsv(items), 'text/csv; charset=utf-8', {
        'Content-Disposition': `attachment; filename="ygo-scan-${exporter.filename}-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      });
    }

    if (p.startsWith('/api/')) throw new HttpError(404, 'Unknown route');
    if (m !== 'GET' && m !== 'HEAD') throw new HttpError(405, 'Method not allowed');
    return serveStatic(res, p);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(m, p, e);
    return json(res, status, { error: (e as Error).message });
  }
}

// ---------- startup ----------

function lanIps(): string[] {
  return Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i!.address);
}

async function tlsOptions() {
  if (config.tlsCert && config.tlsKey) return { cert: fs.readFileSync(config.tlsCert), key: fs.readFileSync(config.tlsKey) };
  const key = path.join(config.dataDir, 'key.pem');
  const cert = path.join(config.dataDir, 'cert.pem');
  if (!fs.existsSync(key) || !fs.existsSync(cert)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    const hosts = ['localhost', '127.0.0.1', ...lanIps(), ...config.certHosts];
    const san = [...new Set(hosts)].map(h => (/^[\d.]+$|:/.test(h) ? `IP:${h}` : `DNS:${h}`)).join(',');
    await run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '825',
      '-keyout', key, '-out', cert, '-subj', '/CN=ygo-scanner', '-addext', `subjectAltName=${san}`]);
    console.log(`Generated a self-signed certificate for ${san}`);
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

refreshSetNumbers().catch(e => console.error('Could not load the set list from CardCluster:', e.message));
ready.catch(e => console.error('OCR model failed to load:', e));

const servers = [
  https.createServer(await tlsOptions(), (req, res) => handle(req, res, { local: false }))
    .listen(config.httpsPort, config.httpsHost, () => {
      console.log('Scanner (open on your phone):');
      for (const host of [...config.certHosts, ...lanIps()]) console.log(`  https://${host}:${config.httpsPort}`);
    }),
  http.createServer((req, res) => handle(req, res, { local: true }))
    .listen(config.httpPort, config.httpHost, () =>
      console.log(`On this computer: http://${config.httpHost === '0.0.0.0' ? '127.0.0.1' : config.httpHost}:${config.httpPort}`)),
];

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    for (const s of servers) s.close();
    process.exit(0);
  });
}
