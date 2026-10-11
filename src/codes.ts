// Set codes printed on cards: "RA01-EN001", "LOB-001", "MP25-EN001", "LDK2-ENJ41".
import type { Language, SetCode } from './types.ts';

/** Legendary Decks number cards per deck: a letter and two digits ("LDK2-ENJ41", "LAVD-ENO18"). */
export function parseCode(raw: string): SetCode | null {
  const s = String(raw).toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const m = s.match(/([A-Z0-9]{2,5})-([A-Z]{0,2})(\d{3}|[A-Z]\d{2})(?![A-Z0-9])/);
  if (!m) return null;
  return { prefix: m[1], region: m[2], number: m[3], code: `${m[1]}-${m[2]}${m[3]}` };
}

// OCR mixes up a leading letter and digit ("O88" for "088", "141" for "J41"): every reading
// is tried and the one that exists in the set wins ("S" may be a blurry 5 or 8, but also a real
// deck letter, as in LAVD-S01). No risk of a wrong card, since a reading must exist in the set.
const LETTER_DIGITS: Record<string, string> = {
  O: '0', Q: '0', D: '0', U: '0', I: '1', L: '1', T: '1', J: '1', S: '58', B: '8', Z: '27', G: '6',
};

/** The number as read first, then its letter/digit look-alikes. */
export function numberReadings(number: string): string[] {
  const [head, tail] = [number[0], number.slice(1)];
  if (!/^\d\d$/.test(tail)) return [number];
  const heads = LETTER_DIGITS[head]
    ? [...LETTER_DIGITS[head]]
    : Object.keys(LETTER_DIGITS).filter(l => LETTER_DIGITS[l].includes(head));
  return [number, ...heads.map(h => h + tail)];
}

const REGION_LANGUAGES: Record<string, Language> = {
  EN: 'en', E: 'en', FR: 'fr', F: 'fr', DE: 'de', G: 'de', IT: 'it', I: 'it', SP: 'es', S: 'es', PT: 'pt', P: 'pt',
};

export function langFromRegion(region: string): Language | null {
  return REGION_LANGUAGES[region] ?? null;
}
