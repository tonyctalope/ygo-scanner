// End-to-end OCR on real crops sent by a phone (needs ImageMagick).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCrops } from '../src/ocr.ts';
import { voteKey } from '../src/decode.ts';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const PREFIXES = ['LDK2', 'DLCS', 'BLCR'];

for (const expected of ['BLCR-EN067', 'DLCS-EN074', 'LDK2-ENJ05']) {
  test(`reads ${expected}`, async () => {
    const { code } = await readCrops([path.join(dir, `${expected}.jpg`)], PREFIXES);
    // Letter/digit look-alikes are resolved later against the set (see numberReadings)
    assert.equal(code && voteKey(code), voteKey(expected));
  });
}
