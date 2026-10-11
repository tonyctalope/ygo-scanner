export interface SetCode {
  prefix: string;
  region: string;
  number: string;
  /** Normalised code, e.g. `RA01-EN001`. */
  code: string;
}

export interface Decoration {
  type: string;
  name: string;
}

export interface Print {
  id: number;
  cardNumber: string;
  rarity: string;
  name: string;
  cardSlug?: string;
  artwork: number;
  decoration: Decoration | null;
  image?: string;
}

export interface CardSet {
  slug: string;
  name: string;
  setNumber: string;
  release?: string;
  languages: string[];
  prints: Print[];
}

export interface Candidate {
  printId: number;
  name: string;
  rarity: string;
  rarityName: string;
  artwork: number;
  decoration: Decoration | null;
  cardSlug?: string;
  setName: string;
  setSlug: string;
  release?: string;
  image: string | null;
}

export interface LookupResult {
  code: SetCode;
  lang: Language | null;
  candidates: Candidate[];
}

export const LANGUAGES = ['en', 'fr', 'de', 'it', 'es', 'pt'] as const;
export type Language = (typeof LANGUAGES)[number];

export const EDITIONS = ['1st', 'unlimited', 'limited', ''] as const;
export type Edition = (typeof EDITIONS)[number];

export interface QueueItem {
  id: string;
  setNumber: string;
  cardName: string;
  rarity: string;
  setName: string;
  artwork: number;
  language: Language;
  edition?: Edition;
  quantity: number;
  /** Exact print picked on CardCluster (emblems and stamps are not part of the CSV). */
  printId: number | null;
  decoration: Decoration | null;
  cardSlug?: string;
  /** The CardCluster CSV import cannot tell this print apart from another one. */
  csvAmbiguous?: boolean;
  status: 'pending' | 'exported';
  createdAt: string;
  exportedAt?: string;
}
