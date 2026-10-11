// Scanned cards waiting to be imported, persisted in DATA_DIR/store.json.
import crypto from 'node:crypto';
import path from 'node:path';
import { config } from './config.ts';
import { lookup } from './cardcluster.ts';
import { loadJson, saveJson } from './storage.ts';
import { EDITIONS, LANGUAGES } from './types.ts';
import type { Candidate, Edition, Language, QueueItem } from './types.ts';

const FILE = path.join(config.dataDir, 'store.json');
const store = loadJson<{ queue: QueueItem[] }>(FILE, { queue: [] });
const save = () => saveJson(FILE, store);

export const all = () => store.queue;
export const pending = () => store.queue.filter(i => i.status === 'pending');

/** True when the CardCluster CSV cannot tell this print from another one (emblem, stamp…). */
export function ambiguousFor(item: Pick<QueueItem, 'rarity' | 'artwork' | 'setName'>, candidates: Candidate[]): boolean {
  return candidates.filter(c => c.rarity === item.rarity && c.artwork === item.artwork && c.setName === item.setName).length > 1;
}

/** Items saved before the ambiguity check existed: computed once, then stored. */
export async function flagAmbiguous(): Promise<void> {
  const todo = pending().filter(i => i.csvAmbiguous === undefined);
  if (!todo.length) return;
  const byCode = new Map<string, Awaited<ReturnType<typeof lookup>> | null>();
  for (const i of todo) {
    if (!byCode.has(i.setNumber)) byCode.set(i.setNumber, await lookup(i.setNumber).catch(() => null));
    const r = byCode.get(i.setNumber);
    if (!r || !('candidates' in r)) continue;
    i.csvAmbiguous = ambiguousFor(i, r.candidates);
    i.cardSlug ??= r.candidates.find(c => c.name === i.cardName)?.cardSlug;
  }
  save();
}

export class ValidationError extends Error {}

export async function add(b: Record<string, any>): Promise<QueueItem> {
  if (!b.setNumber || !b.rarity) throw new ValidationError('setNumber and rarity are required');
  const item: QueueItem = {
    id: crypto.randomUUID(),
    setNumber: String(b.setNumber).toUpperCase(),
    cardName: String(b.cardName || ''),
    rarity: String(b.rarity),
    setName: String(b.setName || ''),
    artwork: Number(b.artwork) || 1,
    language: LANGUAGES.includes(b.language) ? (b.language as Language) : 'en',
    edition: EDITIONS.includes(b.edition) ? (b.edition as Edition) : '',
    quantity: Math.max(1, Math.min(99, Number(b.quantity) || 1)),
    printId: Number(b.printId) || null,
    decoration: b.decoration?.name ? { type: String(b.decoration.type || ''), name: String(b.decoration.name) } : null,
    cardSlug: b.cardSlug ? String(b.cardSlug) : undefined,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  const r = await lookup(item.setNumber).catch(() => null);
  if (r && 'candidates' in r) item.csvAmbiguous = ambiguousFor(item, r.candidates);
  store.queue.push(item);
  save();
  return item;
}

export function markExported(id?: string): boolean {
  const now = new Date().toISOString();
  const items = id ? store.queue.filter(i => i.id === id) : pending();
  for (const i of items) Object.assign(i, { status: 'exported', exportedAt: now });
  save();
  return items.length > 0;
}

export function remove(id: string): boolean {
  const before = store.queue.length;
  store.queue = store.queue.filter(i => i.id !== id);
  save();
  return store.queue.length < before;
}
