// Runtime configuration, read from the environment (and from `.env` when present).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile();
} catch {
  // no .env file: defaults and the real environment apply
}

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const env = process.env;
const int = (name: string, fallback: number) => {
  const n = Number(env[name]);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
};
const bool = (name: string, fallback: boolean) =>
  env[name] === undefined ? fallback : /^(1|true|yes|on)$/i.test(env[name]!);
const list = (name: string) => (env[name] || '').split(',').map(s => s.trim()).filter(Boolean);

export const config = {
  /** HTTPS server for the phone (the camera API requires a secure context). */
  httpsPort: int('HTTPS_PORT', 8443),
  httpsHost: env.HTTPS_HOST || '0.0.0.0',
  /** Plain HTTP server, meant for the computer the scanner runs on (CSV downloads). */
  httpPort: int('HTTP_PORT', 8787),
  httpHost: env.HTTP_HOST || '127.0.0.1',
  /** Scanned cards, caches and the generated certificate live here. */
  dataDir: path.resolve(ROOT, env.DATA_DIR || 'data'),
  /** Bring your own certificate; otherwise a self-signed one is generated in DATA_DIR. */
  tlsCert: env.TLS_CERT || '',
  tlsKey: env.TLS_KEY || '',
  /** Extra host names / IPs for the self-signed certificate (e.g. the LAN IP of a Docker host). */
  certHosts: list('CERT_HOSTS'),
  cardclusterUrl: (env.CARDCLUSTER_URL || 'https://cardcluster.com').replace(/\/$/, ''),
  /** Keep every recognised crop (and camera diagnostics) in DATA_DIR/reads to debug the OCR. */
  debugCapture: bool('DEBUG_CAPTURE', false),
  debugCaptureKeep: int('DEBUG_CAPTURE_KEEP', 200),
  ocrThreads: int('OCR_THREADS', 2) || 2,
};
