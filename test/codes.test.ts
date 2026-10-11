import { test } from 'node:test';
import assert from 'node:assert/strict';
import { langFromRegion, numberReadings, parseCode } from '../src/codes.ts';

test('parseCode reads regular, regionless and Legendary Deck codes', () => {
  assert.deepEqual(parseCode('ra01-fr001'), { prefix: 'RA01', region: 'FR', number: '001', code: 'RA01-FR001' });
  assert.deepEqual(parseCode('LOB-001'), { prefix: 'LOB', region: '', number: '001', code: 'LOB-001' });
  assert.equal(parseCode(' LDK2-ENJ41 ')?.number, 'J41');
  assert.equal(parseCode('not a code'), null);
});

test('numberReadings tries letter/digit look-alikes after the reading itself', () => {
  assert.deepEqual(numberReadings('088'), ['088', 'O88', 'Q88', 'D88', 'U88']);
  assert.deepEqual(numberReadings('O88'), ['O88', '088']);
  assert.deepEqual(numberReadings('141').slice(0, 2), ['141', 'I41']);
  assert.ok(numberReadings('141').includes('J41'));
  assert.deepEqual(numberReadings('S01'), ['S01', '501', '801']);
  assert.deepEqual(numberReadings('12'), ['12']);
});

test('langFromRegion maps region letters to CardCluster languages', () => {
  assert.equal(langFromRegion('FR'), 'fr');
  assert.equal(langFromRegion('E'), 'en');
  assert.equal(langFromRegion('SP'), 'es');
  assert.equal(langFromRegion(''), null);
});
