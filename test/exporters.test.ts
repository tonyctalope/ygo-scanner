import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardcluster, dragonshield } from '../src/exporters.ts';
import type { QueueItem } from '../src/types.ts';

const item = (over: Partial<QueueItem>): QueueItem => ({
  id: 'x', setNumber: 'RA01-FR001', cardName: 'Lava Golem', rarity: 'SR', setName: '25th Anniversary Rarity Collection',
  artwork: 1, language: 'fr', edition: '1st', quantity: 1, printId: 1, decoration: null, status: 'pending',
  createdAt: '2026-10-11T10:00:00.000Z', ...over,
});

test('CardCluster CSV groups identical prints and keeps the artwork number', () => {
  const csv = cardcluster.toCsv([
    item({}), item({ quantity: 2 }),
    item({ setNumber: 'LDK2-ENJ41', cardName: 'Red-Eyes; "Flare"', rarity: 'UR', artwork: 2, language: 'en', setName: 'Legendary Decks II' }),
  ]);
  assert.equal(csv, [
    'Haves;Card name;Set number;Rarity;Artwork number;Set name;Language',
    '3;Lava Golem;RA01-FR001;SR;;25th Anniversary Rarity Collection;fr',
    '1;"Red-Eyes; ""Flare""";LDK2-ENJ41;UR;2;Legendary Decks II;en',
    '',
  ].join('\r\n'));
});

test('Dragon Shield CSV matches the app export layout', () => {
  const csv = dragonshield.toCsv([
    item({ rarity: 'QCSCR', cardName: 'A Bao A Qu, the Lightless Shadow' }),
    item({ edition: 'unlimited', rarity: 'SLR', language: 'en', quantity: 2 }),
  ]);
  assert.equal(csv, [
    '"sep=,"',
    'Folder Name,Quantity,Trade Quantity,Card Name,Set Code,Set Name,Card Number,Rarity,Condition,Printing,Language,Price Bought,Date Bought,AVG,LOW,TREND',
    ',1,0,"A Bao A Qu, the Lightless Shadow",RA01,25th Anniversary Rarity Collection,RA01-FR001,QCScR,NearMint,1st Edition,French,0.00,2026-10-11,,,',
    ',2,0,Lava Golem,RA01,25th Anniversary Rarity Collection,RA01-FR001,StR,NearMint,Unlimited,English,0.00,2026-10-11,,,',
    '',
  ].join('\r\n'));
});
