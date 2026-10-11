import { applyStatic, locale, setLocale, t } from './i18n.ts';

// ---------- types shared with the server ----------

interface Decoration { type: string; name: string }
interface Candidate {
  printId: number; name: string; rarity: string; rarityName: string; artwork: number;
  decoration: Decoration | null; cardSlug?: string; setName: string; setSlug: string; image: string | null;
}
interface LookupResult { code: { code: string }; lang: Language | null; candidates: Candidate[] }
interface QueueItem {
  id: string; setNumber: string; cardName: string; rarity: string; setName: string; artwork: number;
  language: Language; edition?: Edition; quantity: number; printId: number | null; decoration: Decoration | null;
  cardSlug?: string; csvAmbiguous?: boolean; status: 'pending' | 'exported';
}

const LANGUAGES = ['en', 'fr', 'de', 'it', 'es', 'pt'] as const;
type Language = (typeof LANGUAGES)[number];
const EDITIONS = ['1st', 'unlimited', 'limited'] as const;
type Edition = (typeof EDITIONS)[number];

// ---------- helpers ----------

function $<T extends HTMLElement = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element ${sel}`);
  return el;
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...children);
  return el;
}

const store = {
  get(key: string) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { localStorage.setItem(key, value); } catch {} },
};

async function api<T = any>(url: string, { method = 'GET', body }: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error === 'unreadable_code' ? t.unreadable : data.error || `HTTP ${r.status}`);
  return data as T;
}

function setStatus(text: string, isErr = false) {
  const el = $('#status');
  el.textContent = text;
  el.classList.toggle('err', isErr);
}

let toastTimer: number | undefined;
function toast(text: string, isErr = false) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.toggle('err', isErr);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.hidden = true; }, 2500);
}

const buzz = (ms: number) => navigator.vibrate?.(ms);

// Shows JS errors on screen (phones have no console)
window.addEventListener('error', e => setStatus(t.error(e.message), true));
window.addEventListener('unhandledrejection', e => setStatus(t.error(e.reason?.message || String(e.reason)), true));

// ---------- state ----------

const video = $<HTMLVideoElement>('#video');
const resultDlg = $<HTMLDialogElement>('#resultDlg');
const queueDlg = $<HTMLDialogElement>('#queueDlg');

const state = {
  lookup: null as LookupResult | null,
  choice: null as Candidate | null,
  lang: (store.get('language') as Language) || (locale === 'fr' ? 'fr' : 'en'),
  edition: (store.get('edition') as Edition) || '1st',
  qty: 1,
};

// ---------- camera ----------

function camMessage(text: string, withButton = false) {
  const msg = $('#camMsg');
  msg.hidden = !text;
  msg.replaceChildren(text);
  if (withButton) msg.append(h('button', { type: 'button', className: 'primary', textContent: t.enableCamera, onclick: startCamera }));
}

let currentStream: MediaStream | null = null;

async function startCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return camMessage(t.needHttps);
  camMessage(t.askingCamera);
  currentStream?.getTracks().forEach(tr => tr.stop());
  const deviceId = store.get('cameraId');
  const base: MediaTrackConstraints = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } };
  try {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { ...base, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    } catch (e) {
      // Some phones reject resolution constraints: retry with the simplest request
      if ((e as DOMException).name === 'NotAllowedError') throw e;
      stream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? base : true, audio: false });
    }
    currentStream = stream;
    video.srcObject = stream;
    const [track] = stream.getVideoTracks();
    // Continuous focus when the phone supports it
    const caps = (track.getCapabilities?.() || {}) as MediaTrackCapabilities & { focusMode?: string[] };
    if (caps.focusMode?.includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {});
    try {
      await video.play();
      camMessage('');
    } catch {
      // Autoplay blocked: needs a user gesture
      camMessage(t.tapToStart, true);
    }
    await listCameras(track);
    setTimeout(() => {
      if (!video.videoWidth) camMessage(t.noFrames, true);
      sendDiag(track);
    }, 3000);
  } catch (e) {
    const err = e as DOMException;
    camMessage(err.name === 'NotAllowedError' ? t.cameraDenied : t.cameraUnavailable(`${err.name}: ${err.message}`), true);
    sendDiag(null, `${err.name}: ${err.message}`);
  }
}

// Every camera frame is copied into the preview canvas, framed like object-fit: cover (the
// <video> stays black on some Android phones). Rounded corners and the dimmed area around
// the guide are drawn here too.
const preview = $<HTMLCanvasElement>('#preview');
const pctx = preview.getContext('2d')!;
const pageBg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0d0f14';

function drawPreview() {
  const vw = video.videoWidth, vh = video.videoHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(preview.clientWidth * dpr), H = Math.round(preview.clientHeight * dpr);
  if (W && H) {
    if (preview.width !== W || preview.height !== H) { preview.width = W; preview.height = H; }
    pctx.save();
    pctx.fillStyle = pageBg;
    pctx.fillRect(0, 0, W, H);
    pctx.beginPath();
    pctx.roundRect(0, 0, W, H, 14 * dpr);
    pctx.clip();
    pctx.fillStyle = '#000';
    pctx.fillRect(0, 0, W, H);
    if (vw) {
      const scale = Math.max(W / vw, H / vh);
      const sw = W / scale, sh = H / scale;
      pctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, W, H);
      // Dim everything but the guide
      const box = preview.getBoundingClientRect();
      const g = $('.guide').getBoundingClientRect();
      pctx.beginPath();
      pctx.rect(0, 0, W, H);
      pctx.roundRect((g.left - box.left) * dpr, (g.top - box.top) * dpr, g.width * dpr, g.height * dpr, 10 * dpr);
      pctx.fillStyle = 'rgba(5, 6, 12, .55)';
      pctx.fill('evenodd');
    }
    pctx.restore();
  }
  if (vw && video.requestVideoFrameCallback) video.requestVideoFrameCallback(drawPreview);
  else requestAnimationFrame(drawPreview);
}
drawPreview();

// Camera names are only known once access is granted
async function listCameras(activeTrack: MediaStreamTrack) {
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
  const sel = $<HTMLSelectElement>('#cameraSel');
  sel.replaceChildren(...cams.map((c, i) => new Option(c.label || t.camera(i + 1), c.deviceId)));
  sel.value = activeTrack.getSettings().deviceId || '';
  sel.hidden = cams.length < 2;
}

$<HTMLSelectElement>('#cameraSel').addEventListener('change', e => {
  store.set('cameraId', (e.target as HTMLSelectElement).value);
  startCamera();
});

// Camera state + a test frame for the server (only stored with DEBUG_CAPTURE)
async function sendDiag(track: MediaStreamTrack | null, error?: string) {
  let frame: string | null = null;
  if (video.videoWidth) {
    const c = h('canvas', { width: 480, height: Math.round(480 * video.videoHeight / video.videoWidth) });
    c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height);
    frame = c.toDataURL('image/jpeg', 0.8);
  }
  const cams = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter(d => d.kind === 'videoinput').map(d => d.label);
  await api('/api/diag', {
    method: 'POST',
    body: {
      ua: navigator.userAgent, error, cameras: cams,
      track: track && { label: track.label, readyState: track.readyState, muted: track.muted, settings: track.getSettings() },
      video: { w: video.videoWidth, h: video.videoHeight, readyState: video.readyState, paused: video.paused },
      frame,
    },
  }).catch(() => {});
}

// ---------- capture & OCR ----------

interface Region { src: CanvasImageSource; sx: number; sy: number; sw: number; sh: number }

/** The guide frame area in video coordinates (the video is object-fit: cover). */
function grabGuide(): Region | null {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw) return null;
  const box = video.getBoundingClientRect();
  const g = $('.guide').getBoundingClientRect();
  const scale = Math.max(box.width / vw, box.height / vh);
  const offX = (vw * scale - box.width) / 2;
  const offY = (vh * scale - box.height) / 2;
  return {
    src: video,
    sx: (g.left - box.left + offX) / scale, sy: (g.top - box.top + offY) / scale,
    sw: g.width / scale, sh: g.height / scale,
  };
}

/** JPEG crop; the server cleans it up (ImageMagick) before OCR. */
function crop({ src, sx, sy, sw, sh }: Region, maxW = 2400) {
  const k = Math.min(1, maxW / sw);
  const c = h('canvas', { width: Math.round(sw * k), height: Math.round(sh * k) });
  c.getContext('2d')!.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.92);
}

/** Full guide frame + a tighter version (less noise around the text). */
function guideCrops() {
  const region = grabGuide();
  if (!region) return null;
  const inner = {
    ...region,
    sx: region.sx + region.sw * 0.08, sw: region.sw * 0.84,
    sy: region.sy + region.sh * 0.12, sh: region.sh * 0.76,
  };
  return [crop(inner), crop(region)];
}

async function recognize(images: string[], photo = false) {
  setStatus(t.reading);
  const r = await api<{ code: string | null; raw: string }>('/api/ocr', { method: 'POST', body: { images, photo } });
  if (!r.code) return setStatus(t.notRecognised(r.raw.slice(0, 60)), true);
  $<HTMLInputElement>('#codeInput').value = r.code;
  await doLookup(r.code);
}

$('#shootBtn').addEventListener('click', async () => {
  const images = guideCrops();
  if (!images) return setStatus(t.cameraNotReady, true);
  buzz(30);
  await recognize(images).catch(e => setStatus(e.message, true));
});

$<HTMLInputElement>('#fileInput').addEventListener('change', async e => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const bmp = await createImageBitmap(file);
  // Full photo: tesseract looks for the code anywhere in the picture
  const image = crop({ src: bmp, sx: 0, sy: 0, sw: bmp.width, sh: bmp.height }, 3000);
  await recognize([image], true).catch(err => setStatus(err.message, true));
});

$('#manualForm').addEventListener('submit', e => {
  e.preventDefault();
  const code = $<HTMLInputElement>('#codeInput').value.trim();
  if (code) doLookup(code);
});

// ---------- auto scan ----------
// Reads the guide frame in a loop (one request at a time) and opens the rarity picker as soon
// as a code known to CardCluster is read twice in a row.

// How long a code must be gone before the same card can be scanned again (~4 frames)
const IGNORE_GAP = 1200;
const auto = {
  on: store.get('autoScan') !== '0',
  busy: false,
  pending: null as string | null,
  ignore: null as string | null,
  ignoreUntil: 0,
  misses: new Map<string, number>(),
};

function renderAuto() {
  $('#autoBtn').setAttribute('aria-pressed', String(auto.on));
  $('#scanLine').hidden = !auto.on;
}

$('#autoBtn').addEventListener('click', () => {
  auto.on = !auto.on;
  store.set('autoScan', auto.on ? '1' : '0');
  renderAuto();
  setStatus(auto.on ? t.autoOn : '');
});

const scanning = () => !resultDlg.open && !queueDlg.open;

async function autoTick() {
  if (!auto.on || auto.busy || !scanning() || document.hidden || !video.videoWidth) return;
  auto.busy = true;
  try {
    const images = guideCrops();
    if (!images) return;
    const r = await api<{ code: string | null }>('/api/ocr', { method: 'POST', body: { images } });
    if (auto.ignore && Date.now() >= auto.ignoreUntil) {
      auto.ignore = null;
      setStatus('');
    }
    // A miss between two reads does not reset the counter; another code does
    if (!r.code || !scanning()) return;
    // Same card as the one just added: wait for it to leave the frame for a moment
    // (time to swap cards, e.g. the same card in SR then in UR)
    if (r.code === auto.ignore && Date.now() < auto.ignoreUntil) {
      auto.ignoreUntil = Date.now() + IGNORE_GAP;
      setStatus(t.justScanned(r.code));
      return;
    }
    // Recently looked up and not found: don't ask CardCluster again
    if (Date.now() - (auto.misses.get(r.code) || 0) < 30000) return;
    // Two identical reads in a row: a digit misread once is not enough
    const confirmed = r.code === auto.pending;
    auto.pending = r.code;
    if (!confirmed) return;
    auto.pending = null;
    buzz(60);
    $<HTMLInputElement>('#codeInput').value = r.code;
    const found = await doLookup(r.code);
    if (!found) auto.misses.set(r.code, Date.now());
  } catch {
    // transient network error: next tick retries
  } finally {
    auto.busy = false;
  }
}

renderAuto();
// A read takes ~0.1 s: several frames per second can be analysed
setInterval(autoTick, 250);

// ---------- rarity pills (colours from cardcluster.com/rarities) ----------

const RARITY_STYLE: Record<string, string[]> = {
  C: ['#eeeeee', '#777777'], R: ['#c0c0c0'], SR: ['#cd7f32'], UR: ['#ffc64c'], SCR: ['#623cea'],
  UMR: ['#52d1dc'], PMUR: ['#52d1dc'], CR: ['#52d1dc'], PMCR: ['#52d1dc'], QCSCR: ['#52d1dc'],
  GHR: ['#111111'], SLRA: ['#111111'], SLR: ['#111111'], PHRU: ['#111111'], PHRS: ['#111111'],
  PMSCR: ['#623cea'], DSUR: ['#ffc64c'],
  GR: ['#b89130'], GHGR: ['#b89130', '#fff', '#111111'], GSCR: ['#b89130', '#fff', '#623cea'], PGR: ['#b89130'],
  PLR: ['#edf6f9', '#777777'], PLSCR: ['#edf6f9', '#777777', '#623cea'],
  BLSCR: ['#623cea'], URA: ['#ffc64c'], SURA: ['#ffc64c'], BLUR: ['#ffc64c'], GRUR: ['#ffc64c'],
  PUUR: ['#ffc64c'], REUR: ['#ffc64c'], SUR: ['#ffc64c'],
  BWR: ['#c0c0c0'], BLR: ['#c0c0c0'], BRR: ['#c0c0c0'], LBR: ['#c0c0c0'], GRR: ['#c0c0c0'],
  PRR: ['#c0c0c0'], RER: ['#c0c0c0'], GLR: ['#c0c0c0'],
  DTSCR: ['#623cea', '#fff', '#e5989b'], DTUR: ['#ffc64c', '#fff', '#e5989b'], DTSR: ['#cd7f32', '#fff', '#e5989b'],
  DTR: ['#c0c0c0', '#fff', '#e5989b'], DTC: ['#eeeeee', '#777777', '#e5989b'],
  PUR: ['#ffc64c', '#fff', '#e5989b'], PSR: ['#cd7f32', '#fff', '#e5989b'], PC: ['#eeeeee', '#777777', '#e5989b'],
  SFR: ['#c0c0c0', '#fff', '#e5989b'], MSR: ['#c0c0c0', '#fff', '#e5989b'], SHR: ['#c0c0c0', '#fff', '#e5989b'],
  GMR: ['#cc1e22'], EXSCR: ['#cc1e22'], '10K': ['#cc1e22'],
};

const pill = (text: string, cls: string, title = '') => h('span', { className: `pill ${cls}`, textContent: text, title });

function rarityPill(code: string) {
  const [bg = '#555', fg = '#fff', border] = RARITY_STYLE[code] || [];
  const el = pill(code, 'pill-rarity');
  el.style.background = bg;
  el.style.color = fg;
  if (border) el.style.boxShadow = `inset 0 0 0 2px ${border}`;
  return el;
}

// ---------- lookup & rarity picker ----------

async function doLookup(code: string): Promise<boolean> {
  setStatus(t.searching(code.toUpperCase()));
  let r: LookupResult;
  try {
    r = await api<LookupResult>(`/api/lookup?code=${encodeURIComponent(code)}`);
  } catch (e) {
    setStatus((e as Error).message, true);
    return false;
  }
  if (!r.candidates.length) { setStatus(t.notFound(r.code.code), true); return false; }
  setStatus('');
  state.lookup = r;
  state.choice = r.candidates.length === 1 ? r.candidates[0] : null;
  state.qty = 1;
  if (r.lang) state.lang = r.lang;
  renderResult();
  if (!resultDlg.open) resultDlg.showModal();
  return true;
}

function segButtons<T extends string>(container: HTMLElement, values: readonly T[], label: (v: T) => string, current: T, pick: (v: T) => void) {
  container.replaceChildren(...values.map(v => h('button', {
    type: 'button', textContent: label(v), onclick: () => { pick(v); renderResult(); },
  })));
  container.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(values[i] === current)));
}

function renderResult() {
  const r = state.lookup;
  if (!r) return;
  $('#resCode').textContent = r.code.code;
  $('#resName').textContent = r.candidates[0].name;
  const sets = new Set(r.candidates.map(x => x.setSlug));
  $('#candidates').replaceChildren(...r.candidates.map(c => {
    const img = h('img', { alt: '', loading: 'lazy' });
    if (c.image) img.src = c.image;
    img.onerror = () => { img.style.visibility = 'hidden'; };
    const pills = h('div', { className: 'pills' }, rarityPill(c.rarity));
    if (c.artwork > 1) pills.append(pill(`#${c.artwork}`, 'pill-art', t.artwork(c.artwork)));
    if (c.decoration) pills.append(pill(`${c.decoration.type === 'emblem' ? '🛡' : '🔖'} ${c.decoration.name}`, 'pill-deco', c.decoration.name));
    const b = h('button', { type: 'button', className: 'cand', onclick: () => { state.choice = c; renderResult(); } },
      img,
      h('div', {}, pills, h('div', { className: 'r', textContent: c.rarityName }), h('div', { className: 's', textContent: sets.size > 1 ? c.setName : '' })),
      h('span', { className: 'check' }));
    b.setAttribute('aria-pressed', String(state.choice === c));
    return b;
  }));
  segButtons($('#langSeg'), LANGUAGES, l => l.toUpperCase(), state.lang, l => { state.lang = l; store.set('language', l); });
  segButtons($('#editionSeg'), EDITIONS, e => t.editions[e], state.edition, e => { state.edition = e; store.set('edition', e); });
  $('#qty').textContent = String(state.qty);
  $<HTMLButtonElement>('#addBtn').disabled = !state.choice;
}

$('#qtyMinus').addEventListener('click', () => { state.qty = Math.max(1, state.qty - 1); renderResult(); });
$('#qtyPlus').addEventListener('click', () => { state.qty = Math.min(99, state.qty + 1); renderResult(); });
$('#cancelBtn').addEventListener('click', () => resultDlg.close());
resultDlg.addEventListener('close', backToScan);

$('#addBtn').addEventListener('click', async () => {
  const c = state.choice;
  if (!c || !state.lookup) return;
  try {
    await api('/api/queue', {
      method: 'POST',
      body: {
        setNumber: state.lookup.code.code, cardName: c.name, rarity: c.rarity, setName: c.setName, artwork: c.artwork,
        printId: c.printId, decoration: c.decoration, cardSlug: c.cardSlug,
        language: state.lang, edition: state.edition, quantity: state.qty,
      },
    });
    toast(t.added(c.name, c.rarity, state.lang.toUpperCase()));
    resultDlg.close();
    refreshQueue();
  } catch (e) {
    toast((e as Error).message, true);
  }
});

function backToScan() {
  // Don't reopen the card that is still in front of the camera
  if (state.lookup) {
    auto.ignore = state.lookup.code.code;
    auto.ignoreUntil = Date.now() + IGNORE_GAP;
  }
  state.lookup = null;
  state.choice = null;
  $<HTMLInputElement>('#codeInput').value = '';
}

// ---------- queue & CSV exports ----------

let lastQueue: QueueItem[] = [];

async function refreshQueue() {
  const { queue } = await api<{ queue: QueueItem[] }>('/api/queue');
  lastQueue = queue;
  renderQueue();
}

function queueRow(i: QueueItem) {
  const art = i.artwork > 1 ? ` #${i.artwork}` : '';
  const edition = i.edition ? ` · ${t.editions[i.edition as Edition] ?? ''}` : '';
  // Exact version: known emblem/stamp, none, or not recorded (older entries)
  const deco = i.decoration ? ` · ${i.decoration.name}` : i.printId ? ` · ${t.noEmblem}` : i.csvAmbiguous ? ` · ${t.unknownVersion}` : '';
  const label = i.status !== 'pending' ? t.imported : i.csvAmbiguous ? t.byHand : '';
  const li = h('li', { className: `st-${i.status}${i.status === 'pending' && i.csvAmbiguous ? ' st-manual' : ''}` },
    h('div', {},
      h('span', { className: 'q', textContent: `${i.quantity}×` }),
      `${i.cardName}`,
      h('small', { textContent: `${i.setNumber} · ${i.rarity}${art} · ${i.language.toUpperCase()}${edition}${deco}${label ? ` · ${label}` : ''}` })));
  if (i.status !== 'pending') return li;
  const actions = h('div', { className: 'actions' });
  if (i.csvAmbiguous) {
    if (i.cardSlug) actions.append(h('a', { href: `https://cardcluster.com/card/${i.cardSlug}`, target: '_blank', rel: 'noopener', textContent: t.open }));
    actions.append(h('button', {
      type: 'button', textContent: t.done,
      onclick: async () => { await api(`/api/queue/${i.id}/done`, { method: 'POST' }); refreshQueue(); },
    }));
  }
  actions.append(h('button', {
    type: 'button', textContent: t.remove,
    onclick: async () => { await api(`/api/queue/${i.id}`, { method: 'DELETE' }); refreshQueue(); },
  }));
  li.append(actions);
  return li;
}

function renderQueue() {
  const pending = lastQueue.filter(i => i.status === 'pending');
  const total = pending.reduce((n, i) => n + i.quantity, 0);
  $('#queueCount').textContent = String(total);
  $('#queueCount').classList.toggle('zero', !total);
  $('#pendingCount').textContent = t.pendingCount(total);
  const manual = pending.filter(i => i.csvAmbiguous);
  const csvItems = pending.filter(i => !i.csvAmbiguous);
  $('#csvCardcluster').setAttribute('aria-disabled', String(!csvItems.length));
  $('#csvDragonshield').setAttribute('aria-disabled', String(!pending.length));
  $<HTMLButtonElement>('#markBtn').disabled = !pending.length;
  $('#manualHint').hidden = !manual.length;
  $('#manualHint').textContent = t.manualHint(manual.length);
  // Pending first (cards to add by hand on top), then recent history
  const done = lastQueue.filter(i => i.status !== 'pending').slice(-50).reverse();
  const rows: HTMLElement[] = [...manual.reverse(), ...csvItems.reverse()].map(queueRow);
  if (done.length) rows.push(h('li', { className: 'section', textContent: t.history }), ...done.map(queueRow));
  $('#queueList').replaceChildren(...(rows.length ? rows : [h('li', { className: 'empty', textContent: t.empty })]));
}

$('#queueBtn').addEventListener('click', () => { refreshQueue().catch(() => {}); queueDlg.showModal(); });
$('#closeQueue').addEventListener('click', () => queueDlg.close());
$('#markBtn').addEventListener('click', async () => {
  await api('/api/queue/mark-exported', { method: 'POST' });
  toast(t.markedImported);
  refreshQueue();
});

// Tapping the backdrop closes a sheet
for (const dlg of [resultDlg, queueDlg]) {
  dlg.addEventListener('click', e => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) dlg.close();
  });
}

// ---------- language ----------

function renderLocale() {
  $('#localeBtn').textContent = locale === 'fr' ? 'EN' : 'FR';
  applyStatic();
  renderQueue();
  renderResult();
}
$('#localeBtn').addEventListener('click', () => {
  setLocale(locale === 'fr' ? 'en' : 'fr');
  renderLocale();
});

renderLocale();
startCamera();
refreshQueue().catch(() => {});
setInterval(() => { if (!document.hidden) refreshQueue().catch(() => {}); }, 15000);
