// Set code recognition: PP-OCRv4 text recognition (PaddleOCR, ONNX model, runs locally) on the
// strip cropped by the phone; tesseract is still used for full photos.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ort from 'onnxruntime-node';
import { config } from './config.ts';
import { decodeCode, vote } from './decode.ts';

const run = promisify(execFile);
const MODELS = path.join(path.dirname(createRequire(import.meta.url).resolve('@gutenye/ocr-models/node')), 'assets');

export interface OcrResult {
  code: string | null;
  raw: string;
}

// ImageMagick 7 ships `magick`; ImageMagick 6 (Debian, Ubuntu) only `convert`.
const magickBin = run('magick', ['-version']).then(() => 'magick', () => 'convert');
async function magick(args: string[]): Promise<void> {
  await run(await magickBin, args, { timeout: 15000 });
}
async function magickBuffer(args: string[]): Promise<Buffer> {
  const { stdout } = await run(await magickBin, args, { encoding: 'buffer', maxBuffer: 1 << 26, timeout: 10000 });
  return stdout;
}

// ---------- PP-OCRv4 (single line recognition) ----------

const H = 48;
const keys = ['', ...fs.readFileSync(path.join(MODELS, 'ppocr_keys_v1.txt'), 'utf8').replace(/\n$/, '').split('\n'), ' '];
const session = ort.InferenceSession.create(path.join(MODELS, 'ch_PP-OCRv4_rec_infer.onnx'), {
  intraOpNumThreads: config.ocrThreads,
});

// Fixed input widths: onnxruntime prepares the model for every new shape (several seconds),
// so the image is padded on the right up to the next step.
const WIDTHS = [320, 480, 640];
const MAX_W = WIDTHS.at(-1)!;

async function pixels(file: string, ops: string[], size: string) {
  const stdout = await magickBuffer([file, ...ops, '-resize', size, '-format', '%w ', '-write', 'info:-', '-depth', '8', 'rgb:-']);
  const sp = stdout.indexOf(32);
  const w = Number(stdout.subarray(0, sp).toString());
  return { w, h: (stdout.length - sp - 1) / 3 / w, px: stdout.subarray(sp + 1) };
}

/** Reads one line of text; `ops`: ImageMagick operations applied before scaling. */
async function recognizeLine(file: string, ops: string[] = []): Promise<string> {
  let img = await pixels(file, ops, `x${H}`);
  if (img.w > MAX_W) img = await pixels(file, ops, `${MAX_W}x${H}`);
  const { w, h, px } = img;
  if (!Number.isInteger(h) || w < 8) return '';
  const W = WIDTHS.find(x => x >= w)!;
  // PaddleOCR normalisation: (x/255 - 0.5) / 0.5, CHW; padding stays 0 (mid grey)
  const data = new Float32Array(3 * H * W);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++)
    data[c * H * W + y * W + x] = px[(y * w + x) * 3 + c] / 127.5 - 1;
  return infer(data, W);
}

async function infer(data: Float32Array, W: number): Promise<string> {
  const sess = await session;
  const out = (await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, H, W]) }))[sess.outputNames[0]];
  // Greedy CTC decoding
  const [, T, C] = out.dims;
  const probs = out.data as Float32Array;
  let text = '', prev = 0;
  for (let t = 0; t < T; t++) {
    let best = 0, bi = 0;
    for (let j = 0; j < C; j++) { const v = probs[t * C + j]; if (v > best) { best = v; bi = j; } }
    if (bi !== prev && bi !== 0) text += keys[bi];
    prev = bi;
  }
  return text;
}

/** Warms the model up for every input width at startup rather than on the first card. */
export const ready = (async () => {
  // A few rounds, in parallel like real traffic: the first passes stay slow
  for (let round = 0; round < 3; round++)
    await Promise.all(WIDTHS.map(W => infer(new Float32Array(3 * H * W), W)));
})();

// Each image is read as is, and cropped in height (drops the frame borders)
const LINE_VARIANTS = [[], ['-gravity', 'center', '-crop', '100%x70%+0+0', '+repage']];

/** Reads the strips sent by the phone; a code must come out of at least two agreeing reads. */
export async function readCrops(files: string[], prefixes: readonly string[]): Promise<OcrResult> {
  const texts = await Promise.all(files.flatMap(f => LINE_VARIANTS.map(ops => recognizeLine(f, ops).catch(() => ''))));
  return { code: vote(texts, prefixes), raw: texts.filter(Boolean).join(' | ') };
}

// ---------- tesseract (full photo, the code may be anywhere) ----------

// Local adaptive threshold (-lat) wipes out the card frame texture;
// the negated version handles white codes (dark Xyz/Link frames).
const TESS_VARIANTS = [
  ['-lat', '60x60-8%'],
  ['-negate', '-lat', '60x60-8%'],
];

export async function readPhoto(file: string, prefixes: readonly string[]): Promise<OcrResult> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ygo-tess-'));
  try {
    const texts = await Promise.all(TESS_VARIANTS.map(async (ops, j) => {
      const png = path.join(tmp, `${j}.png`);
      await magick([file, '-colorspace', 'Gray', '-resize', '1200x<', ...ops, png]);
      return Promise.all(['6', '11'].map(psm => run('tesseract', [png, 'stdout', '--psm', psm, '--dpi', '300',
        '-c', 'tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-'], { timeout: 15000, env: { ...process.env, OMP_THREAD_LIMIT: '1' } })
        .then(r => r.stdout.replace(/\s+/g, ' ').trim(), () => '')));
    }));
    const flat = texts.flat().filter(Boolean);
    for (const t of flat) {
      const code = decodeCode(t, prefixes);
      if (code) return { code, raw: t };
    }
    return { code: null, raw: flat.join(' | ') };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
