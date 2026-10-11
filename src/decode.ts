// Turns noisy OCR text into a set code, using the list of known set prefixes.

// Usual confusions, folded into one form to compare with known set codes
const CANON: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', T: '1', J: '1', S: '5', B: '8', Z: '2', G: '6' };
const canon = (s: string) => s.replace(/[OQDILTJSBZG]/g, c => CANON[c]);
// Only safe fixes are applied to the card number: in the card font a blurry 8 reads "S" and
// a 7 reads "Z". Better to miss a read than to pick the wrong card.
const NUM_SAFE: Record<string, string> = { O: '0', Q: '0', D: '0', U: '0', I: '1', L: '1', T: '1', J: '1' };
const REGIONS = ['EN', 'FR', 'DE', 'IT', 'SP', 'PT', 'E', 'F', 'G', 'I', 'S', 'P', ''];

// Vote key: a leading letter folded into the digit it looks like ("O88" ≡ "088")
const VOTE_DIGIT: Record<string, string> = { ...CANON, U: '0' };
export const voteKey = (code: string) =>
  code.replace(/^(.*-[A-Z]{0,2}?)([OQDUILTJSBZG])(\d\d)$/, (_, head: string, c: string, d: string) => head + VOTE_DIGIT[c] + d);

// A leading letter is kept as is ("J41" in Legendary Decks); the server retries with a digit
// when that number does not exist in the set.
function cardNumber(raw: string): string | null {
  const fix = (s: string) => s.replace(/[OQDUILTJ]/g, c => NUM_SAFE[c]);
  const n = fix(raw);
  if (/^\d{3}$/.test(n) && /^\d/.test(raw)) return n;
  const tail = fix(raw.slice(1));
  if (/^[A-Z]$/.test(raw[0] ?? '') && /^\d\d$/.test(tail)) return raw[0] + tail;
  return /^\d{3}$/.test(n) ? n : null;
}

/**
 * Finds a plausible code in noisy text ("RAO5-ENO88" -> "RA05-EN088").
 * `prefixes`: known set codes, longest first. Without them, only a strict pattern matches.
 */
export function decodeCode(text: string, prefixes: readonly string[]): string | null {
  const flat = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const ct = canon(flat);
  let best: { score: number; code: string } | null = null;
  for (const prefix of prefixes) {
    const cp = canon(prefix);
    for (let at = ct.indexOf(cp); at !== -1; at = ct.indexOf(cp, at + 1)) {
      const rest = at + cp.length;
      const after = ct.slice(rest);
      let hit: { region: string; num: string; score: number } | null = null;
      for (const region of REGIONS) {
        const cr = canon(region);
        if (!after.startsWith(cr)) continue;
        const num = cardNumber(flat.slice(rest + cr.length, rest + cr.length + 3));
        if (!num) continue;
        hit = { region, num, score: prefix.length * 2 + region.length };
        break;
      }
      // Region off by one letter ("BN" read instead of "EN")
      if (!hit) {
        const num = cardNumber(flat.slice(rest + 2, rest + 5));
        const two = after.slice(0, 2);
        const near = num && REGIONS.find(r => r.length === 2 && [...canon(r)].filter((ch, k) => ch !== two[k]).length === 1);
        if (num && near) hit = { region: near, num, score: prefix.length * 2 + 1 };
      }
      if (hit && (!best || hit.score > best.score)) best = { score: hit.score, code: `${prefix}-${hit.region}${hit.num}` };
    }
  }
  if (best) return best.code;
  if (prefixes.length) return null;
  const m = text.toUpperCase().match(/[A-Z0-9]{2,5}-[A-Z]{0,2}(?:\d{3}|[A-Z]\d{2})/);
  return m ? m[0] : null;
}

/**
 * Picks the code read by at least two texts, and by more texts than any other code.
 * "RA05-ENO88" and "RA05-EN088" vote together; the most frequent spelling is returned.
 */
export function vote(texts: readonly string[], prefixes: readonly string[]): string | null {
  const votes = new Map<string, { n: number; forms: Map<string, number> }>();
  for (const t of texts) {
    const code = decodeCode(t, prefixes);
    if (!code) continue;
    const key = voteKey(code);
    const v = votes.get(key) ?? { n: 0, forms: new Map() };
    v.n++;
    v.forms.set(code, (v.forms.get(code) ?? 0) + 1);
    votes.set(key, v);
  }
  const [first, second] = [...votes.values()].sort((a, b) => b.n - a.n);
  if (!first || first.n < 2 || (second && second.n >= first.n)) return null;
  return [...first.forms].sort((a, b) => b[1] - a[1])[0][0];
}
