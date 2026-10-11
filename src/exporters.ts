// CSV exports of the scanned cards, one per collection manager.
import type { Edition, Language, QueueItem } from './types.ts';

export interface Exporter {
  id: string;
  label: string;
  filename: string;
  /** Some prints cannot be told apart in this format and must be added by hand. */
  skipsAmbiguous: boolean;
  toCsv(items: QueueItem[]): string;
}

const cell = (sep: string) => (v: unknown) => {
  const s = String(v ?? '');
  return s.includes(sep) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Identical scans (same print, language and edition) become one row; quantities add up. */
function group(items: QueueItem[], key: (i: QueueItem) => unknown[]): QueueItem[] {
  const rows = new Map<string, QueueItem>();
  for (const i of items) {
    const k = key(i).join('|');
    const row = rows.get(k);
    if (row) row.quantity += i.quantity;
    else rows.set(k, { ...i });
  }
  return [...rows.values()];
}

// ---------- CardCluster: collection → "Import CSV" ----------

export const cardcluster: Exporter = {
  id: 'cardcluster',
  label: 'CardCluster',
  filename: 'cardcluster',
  // The import only tells prints apart by rarity, artwork and set name: when several remain
  // (e.g. with and without a WCS emblem), the card has to be added by hand.
  skipsAmbiguous: true,
  toCsv(items) {
    const c = cell(';');
    const header = ['Haves', 'Card name', 'Set number', 'Rarity', 'Artwork number', 'Set name', 'Language'];
    const rows = group(items, i => [i.setNumber, i.rarity, i.artwork, i.setName, i.language]).map(r =>
      [r.quantity, r.cardName, r.setNumber, r.rarity, r.artwork > 1 ? r.artwork : '', r.setName, r.language].map(c).join(';'));
    return [header.join(';'), ...rows].join('\r\n') + '\r\n';
  },
};

// ---------- Dragon Shield Card Manager: "Import CSV" ----------
// Same layout as the app's own export (Folder Name, Quantity, Trade Quantity, …).

// CardCluster rarity -> Dragon Shield abbreviation, as found in Dragon Shield exports.
// Rarities missing here keep CardCluster's abbreviation.
export const DRAGON_SHIELD_RARITIES: Record<string, string> = {
  C: 'C', R: 'R', SR: 'SR', UR: 'UR', SCR: 'ScR', UMR: 'UtR', GHR: 'GR', CR: 'CR',
  QCSCR: 'QCScR', PLSCR: 'PlScR', SLR: 'StR', GMR: 'GMR',
};

const DRAGON_SHIELD_LANGUAGES: Record<Language, string> = {
  en: 'English', fr: 'French', de: 'German', it: 'Italian', es: 'Spanish', pt: 'Portuguese',
};

const DRAGON_SHIELD_PRINTINGS: Record<Edition, string> = {
  '1st': '1st Edition', unlimited: 'Unlimited', limited: 'Limited', '': '',
};

export const dragonshield: Exporter = {
  id: 'dragonshield',
  label: 'Dragon Shield',
  filename: 'dragonshield',
  skipsAmbiguous: false,
  toCsv(items) {
    const c = cell(',');
    const header = ['Folder Name', 'Quantity', 'Trade Quantity', 'Card Name', 'Set Code', 'Set Name', 'Card Number',
      'Rarity', 'Condition', 'Printing', 'Language', 'Price Bought', 'Date Bought', 'AVG', 'LOW', 'TREND'];
    const rows = group(items, i => [i.setNumber, i.rarity, i.artwork, i.setName, i.language, i.edition]).map(r => [
      '', r.quantity, 0, r.cardName, r.setNumber.split('-')[0], r.setName, r.setNumber,
      DRAGON_SHIELD_RARITIES[r.rarity] ?? r.rarity, 'NearMint', DRAGON_SHIELD_PRINTINGS[r.edition ?? ''] ?? '',
      DRAGON_SHIELD_LANGUAGES[r.language] ?? 'English', '0.00', r.createdAt.slice(0, 10), '', '', '',
    ].map(c).join(','));
    return ['"sep=,"', header.join(','), ...rows].join('\r\n') + '\r\n';
  },
};

export const EXPORTERS: Record<string, Exporter> = { cardcluster, dragonshield };
