import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeCode, vote, voteKey } from '../src/decode.ts';

const PREFIXES = ['LDK2', 'RA05', 'RA01', 'BLCR', 'LOB', 'RA'];

test('decodeCode fixes OCR noise against known prefixes', () => {
  assert.equal(decodeCode('RAO5-EN088', PREFIXES), 'RA05-EN088');
  // A leading letter stays: the server tries "088" when "O88" is not in the set
  assert.equal(decodeCode('RAO5-ENO88', PREFIXES), 'RA05-ENO88');
  assert.equal(decodeCode('RA05-EN0O8', PREFIXES), 'RA05-EN008');
  assert.equal(decodeCode('xx RA01·FR001 yy', PREFIXES), 'RA01-FR001');
  assert.equal(decodeCode('BLCR-BN067', PREFIXES), 'BLCR-EN067');
});

test('decodeCode keeps a Legendary Deck letter', () => {
  assert.equal(decodeCode('LDK2-ENJ41', PREFIXES), 'LDK2-ENJ41');
});

test('decodeCode refuses unsafe digit guesses', () => {
  // "S" may be a 5 or an 8: no guess
  assert.equal(decodeCode('RA01-EN0S1', PREFIXES), null);
});

test('decodeCode without a prefix list falls back to a strict pattern', () => {
  assert.equal(decodeCode('foo MP25-EN001 bar', []), 'MP25-EN001');
  assert.equal(decodeCode('nothing', []), null);
});

test('voteKey folds a leading letter into its digit', () => {
  assert.equal(voteKey('RA05-ENO88'), 'RA05-EN088');
  assert.equal(voteKey('LDK2-ENJ41'), 'LDK2-EN141');
});

test('vote needs two agreeing reads and a clear winner', () => {
  assert.equal(vote(['RA05-ENO88', 'RA05-EN088', 'garbage'], PREFIXES), 'RA05-ENO88');
  assert.equal(vote(['RA05-EN088'], PREFIXES), null);
  assert.equal(vote(['RA05-EN088', 'RA05-EN088', 'RA01-EN001', 'RA01-EN001'], PREFIXES), null);
});
