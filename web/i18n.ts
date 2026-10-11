// UI strings. The language follows the browser, and can be switched from the header.
const en = {
  list: 'List',
  scanHint: 'Fill the frame with the set code (e.g. RA01-EN001)',
  auto: 'Auto',
  scan: 'Scan',
  photo: 'Photo',
  manualPlaceholder: 'or type a code: RA01-EN001',
  go: 'Go',
  enableCamera: 'Enable camera',
  needHttps: 'The camera needs HTTPS: open the https:// address printed by the server.',
  askingCamera: 'Requesting camera access…',
  tapToStart: 'Tap to start the video.',
  noFrames: 'The camera is not sending any image.',
  cameraDenied: 'Camera access denied. Allow it in the site settings, then:',
  cameraUnavailable: (e: string) => `Camera unavailable (${e}).`,
  camera: (n: number) => `Camera ${n}`,
  error: (m: string) => `Error: ${m}`,
  reading: 'Reading the code…',
  notRecognised: (raw: string) => `Code not recognised${raw ? ` (read: “${raw}”)` : ''}. Try again or type it.`,
  cameraNotReady: 'Camera not ready.',
  autoOn: 'Auto scan: aim at a card’s set code.',
  justScanned: (code: string) => `${code} was just scanned: move the card out of the frame for a second to scan it again.`,
  searching: (code: string) => `Looking up ${code} on CardCluster…`,
  notFound: (code: string) => `No card found for ${code}.`,
  unreadable: 'Unreadable code.',
  rarity: 'Rarity',
  language: 'Language',
  edition: 'Edition',
  quantity: 'Quantity',
  editions: { '1st': '1st', unlimited: 'Unlimited', limited: 'Limited' },
  artwork: (n: number) => `Artwork ${n}`,
  cancel: 'Cancel',
  add: 'Add to list',
  added: (name: string, rarity: string, lang: string) => `${name} (${rarity}, ${lang}) added`,
  scannedCards: 'Scanned cards',
  pendingCount: (n: number) => `${n} card${n === 1 ? '' : 's'} to import`,
  exportTitle: 'Export',
  exportCardcluster: 'CardCluster',
  exportCardclusterHint: 'Collection → menu → Import CSV, “Add” mode',
  exportDragonshield: 'Dragon Shield',
  exportDragonshieldHint: 'Card Manager → Import → CSV',
  manualHint: (n: number) =>
    `${n} card${n === 1 ? '' : 's'} can’t go through the CardCluster CSV: it can’t tell that version apart (emblem, stamp…). Add ${n === 1 ? 'it' : 'them'} by hand, then tap “Done”.`,
  markAll: 'Mark all as imported',
  close: 'Close',
  markedImported: 'Cards marked as imported',
  inCsv: 'in the CSV',
  byHand: 'add by hand on CardCluster',
  imported: 'imported ✓',
  noEmblem: 'no emblem',
  unknownVersion: 'version not recorded',
  open: 'Open',
  done: 'Done',
  remove: 'Remove',
  empty: 'Nothing scanned yet. Point the camera at a card’s set code.',
  history: 'Recently imported',
};

export type Strings = typeof en;

const fr: Strings = {
  list: 'Liste',
  scanHint: 'Remplis le cadre avec le code (ex. RA01-FR001)',
  auto: 'Auto',
  scan: 'Scanner',
  photo: 'Photo',
  manualPlaceholder: 'ou tape le code : RA01-FR001',
  go: 'OK',
  enableCamera: 'Activer la caméra',
  needHttps: 'La caméra demande HTTPS : ouvre l’adresse https:// affichée par le serveur.',
  askingCamera: 'Demande d’accès à la caméra…',
  tapToStart: 'Touche pour démarrer la vidéo.',
  noFrames: 'La caméra ne renvoie pas d’image.',
  cameraDenied: 'Accès à la caméra refusé. Autorise-le dans les réglages du site, puis :',
  cameraUnavailable: e => `Caméra indisponible (${e}).`,
  camera: n => `Caméra ${n}`,
  error: m => `Erreur : ${m}`,
  reading: 'Lecture du code…',
  notRecognised: raw => `Code non reconnu${raw ? ` (lu : « ${raw} »)` : ''}. Réessaie ou tape-le.`,
  cameraNotReady: 'Caméra pas prête.',
  autoOn: 'Scan automatique : vise le code d’une carte.',
  justScanned: code => `${code} vient d’être scanné : retire la carte du cadre une seconde pour la rescanner.`,
  searching: code => `Recherche de ${code} sur CardCluster…`,
  notFound: code => `Aucune carte trouvée pour ${code}.`,
  unreadable: 'Code illisible.',
  rarity: 'Rareté',
  language: 'Langue',
  edition: 'Édition',
  quantity: 'Quantité',
  editions: { '1st': '1re', unlimited: 'Illimitée', limited: 'Limitée' },
  artwork: n => `Illustration ${n}`,
  cancel: 'Annuler',
  add: 'Ajouter à la liste',
  added: (name, rarity, lang) => `${name} (${rarity}, ${lang}) ajoutée`,
  scannedCards: 'Cartes scannées',
  pendingCount: n => `${n} carte${n > 1 ? 's' : ''} à importer`,
  exportTitle: 'Exporter',
  exportCardcluster: 'CardCluster',
  exportCardclusterHint: 'Collection → menu → Import CSV, mode « Add »',
  exportDragonshield: 'Dragon Shield',
  exportDragonshieldHint: 'Card Manager → Import → CSV',
  manualHint: n =>
    `${n} carte${n > 1 ? 's' : ''} ne passe${n > 1 ? 'nt' : ''} pas par le CSV CardCluster : il ne sait pas distinguer cette version (emblème, tampon…). Ajoute-${n > 1 ? 'les' : 'la'} à la main, puis « Fait ».`,
  markAll: 'Tout marquer comme importé',
  close: 'Fermer',
  markedImported: 'Cartes marquées comme importées',
  inCsv: 'dans le CSV',
  byHand: 'à ajouter à la main sur CardCluster',
  imported: 'importée ✓',
  noEmblem: 'sans emblème',
  unknownVersion: 'version non enregistrée',
  open: 'Ouvrir',
  done: 'Fait',
  remove: 'Retirer',
  empty: 'Rien de scanné pour l’instant. Vise le code d’une carte.',
  history: 'Importées récemment',
};

const STRINGS = { en, fr };
export type Locale = keyof typeof STRINGS;

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem('locale');
    if (saved === 'en' || saved === 'fr') return saved;
  } catch {}
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export let locale: Locale = initialLocale();
export let t: Strings = STRINGS[locale];

export function setLocale(next: Locale) {
  locale = next;
  t = STRINGS[next];
  try { localStorage.setItem('locale', next); } catch {}
  applyStatic();
}

/** Fills the elements marked with data-i18n / data-i18n-placeholder. */
export function applyStatic() {
  document.documentElement.lang = locale;
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = String(t[el.dataset.i18n as keyof Strings]);
  for (const el of document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]'))
    el.placeholder = String(t[el.dataset.i18nPlaceholder as keyof Strings]);
}
