// Read-only client for CardCluster's public API: sets, prints and rarities.
import path from 'node:path';
import { config } from './config.ts';
import { langFromRegion, numberReadings, parseCode } from './codes.ts';
import { loadJson, saveJson } from './storage.ts';
import type { CardSet, Candidate, LookupResult } from './types.ts';

const CC = config.cardclusterUrl;
const HEADERS = {
  'User-Agent': 'ygo-scanner (+https://github.com/tonyctalope/ygo-scanner)',
  Accept: 'application/json',
  'accept-game': 'ygo',
  'accept-language': 'en',
  Referer: `${CC}/`,
};

// CardCluster abbreviations -> names (see cardcluster.com/rarities)
export const RARITIES: Record<string, string> = {
  C: 'Common', R: 'Rare', SR: 'Super Rare', UR: 'Ultra Rare', SCR: 'Secret Rare',
  UMR: 'Ultimate Rare', PMUR: 'Prismatic Ultimate Rare', CR: "Collector's Rare",
  PMCR: "Prismatic Collector's Rare", QCSCR: 'Quarter Century Secret Rare',
  GHR: 'Ghost Rare', SLRA: 'Starlight Rare (Astral)', SLR: 'Starlight Rare',
  PHRU: "Pharaoh's Rare (UR)", PHRS: "Pharaoh's Rare (SCR)", PMSCR: 'Prismatic Secret Rare',
  DSUR: 'Duelist Saga Ultra Rare', GR: 'Gold Rare', GHGR: 'Ghost Gold Rare',
  GSCR: 'Gold Secret Rare', PGR: 'Premium Gold Rare', PLR: 'Platinum Rare',
  PLSCR: 'Platinum Secret Rare', SFR: 'Starfoil Rare', MSR: 'Mosaic Rare',
  SHR: 'Shatterfoil Rare', GMR: 'Grand Master Rare', EXSCR: 'Extra Secret Rare',
  '10K': '10000 Secret Rare', PUR: 'Parallel Ultra Rare', PSR: 'Parallel Super Rare',
  PC: 'Parallel Common', DTSCR: 'Duel Terminal Secret Rare', DTUR: 'Duel Terminal Ultra Rare',
  DTSR: 'Duel Terminal Super Rare', DTR: 'Duel Terminal Rare', DTC: 'Duel Terminal Common',
};

async function get<T>(p: string): Promise<T> {
  const r = await fetch(CC + p, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  const type = r.headers.get('content-type') || '';
  if (!r.ok || !type.includes('json')) throw new Error(`CardCluster ${p} → HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

// ---------- sets (cached for a day) ----------

const SET_TTL = 24 * 3600 * 1000;
const CACHE_FILE = path.join(config.dataDir, 'sets-cache.json');
const setCache = loadJson<Record<string, { at: number; data: CardSet }>>(CACHE_FILE, {});

interface ApiSet {
  slug: string;
  name: string;
  setNumber: string;
  releaseEu?: string;
  releaseNa?: string;
  languages?: { language: string }[];
  prints: {
    id: number;
    cardNumber: string;
    slug?: string;
    artworkNumber?: number;
    decoration?: { type: string; name: string } | null;
    image?: string;
    card?: { name: string; slug: string };
  }[];
}

export async function getSet(slug: string): Promise<CardSet> {
  const hit = setCache[slug];
  if (hit && Date.now() - hit.at < SET_TTL && (!hit.data.prints[0] || 'cardSlug' in hit.data.prints[0])) return hit.data;
  const { data } = await get<{ data: ApiSet }>(`/api/sets/${encodeURIComponent(slug)}`);
  const set: CardSet = {
    slug: data.slug,
    name: data.name,
    setNumber: data.setNumber,
    release: data.releaseEu || data.releaseNa,
    languages: (data.languages || []).map(l => l.language),
    prints: data.prints.map(p => ({
      id: p.id,
      cardNumber: p.cardNumber,
      // Print slugs end with the rarity: "RA01-001-SR"
      rarity: (p.slug || '').split('-')[2] || '',
      name: p.card?.name ?? '',
      cardSlug: p.card?.slug,
      artwork: p.artworkNumber || 1,
      // Emblem (shield) or stamp printed on some versions
      decoration: p.decoration ? { type: p.decoration.type, name: p.decoration.name } : null,
      image: p.image,
    })),
  };
  setCache[slug] = { at: Date.now(), data: set };
  saveJson(CACHE_FILE, setCache);
  return set;
}

/** Every print matching a set code, across all the sets sharing its prefix. */
export async function lookup(raw: string): Promise<LookupResult | { error: string }> {
  const code = parseCode(raw);
  if (!code) return { error: 'unreadable_code' };
  const res = await get<{ sets?: { slug: string; setNumber: string }[] }>(`/api/search?q=${encodeURIComponent(code.prefix)}`);
  const sets: CardSet[] = [];
  for (const s of (res.sets || []).filter(s => s.setNumber === code.prefix).slice(0, 6)) sets.push(await getSet(s.slug));
  const number = numberReadings(code.number).find(n => sets.some(set => set.prints.some(p => p.cardNumber === n)));
  if (number && number !== code.number) Object.assign(code, { number, code: `${code.prefix}-${code.region}${number}` });
  const candidates: Candidate[] = [];
  for (const set of sets) {
    for (const p of set.prints.filter(p => p.cardNumber === code.number)) {
      candidates.push({
        printId: p.id,
        name: p.name,
        rarity: p.rarity,
        rarityName: RARITIES[p.rarity] || p.rarity,
        artwork: p.artwork,
        decoration: p.decoration,
        cardSlug: p.cardSlug,
        setName: set.name,
        setSlug: set.slug,
        release: set.release,
        image: p.image ? `${CC}${p.image}.webp` : null,
      });
    }
  }
  return { code, lang: langFromRegion(code.region), candidates };
}

// ---------- known set codes (to validate OCR reads), cached for a week ----------

const SETNUM_TTL = 7 * 24 * 3600 * 1000;
const SETNUM_FILE = path.join(config.dataDir, 'set-numbers.json');
let setNumbers = loadJson<{ at: number; list: string[] }>(SETNUM_FILE, { at: 0, list: [] });

export const knownPrefixes = () => setNumbers.list;

export async function refreshSetNumbers(): Promise<void> {
  if (setNumbers.list.length && Date.now() - setNumbers.at < SETNUM_TTL) return;
  const found = new Set<string>();
  let page = 1, last = 1;
  do {
    const r = await get<{ data: { setNumber?: string }[]; meta?: { last_page?: number } }>(`/api/sets?page=${page}`);
    for (const s of r.data) if (s.setNumber) found.add(s.setNumber.toUpperCase());
    last = r.meta?.last_page || 1;
    page++;
    await new Promise(res => setTimeout(res, 300));
  } while (page <= last);
  // Longest first: "RA01" must win over "RA"
  setNumbers = { at: Date.now(), list: [...found].sort((a, b) => b.length - a.length) };
  saveJson(SETNUM_FILE, setNumbers);
  console.log(`Loaded ${setNumbers.list.length} set codes from CardCluster`);
}
