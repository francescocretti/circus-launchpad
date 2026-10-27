/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appliedGainDb, clampTrim, normalization } from '../gain.ts';

test('porta il file a −18 LUFS quando il picco lo permette', () => {
  assert.deepEqual(normalization(-24, -8), { gainDb: 6, wantedDb: 6, limited: false });
});

test('abbassa un file troppo forte', () => {
  assert.deepEqual(normalization(-12, -0.5), { gainDb: -6, wantedDb: -6, limited: false });
});

test('il tetto di −1 dBTP limita il guadagno', () => {
  const n = normalization(-24, -3); // servirebbero +6 dB, il picco ne concede 2
  assert.equal(n.limited, true);
  assert.equal(n.wantedDb, 6);
  assert.equal(n.gainDb, 2);
});

test('file silenzioso: nessuna correzione', () => {
  assert.deepEqual(normalization(-Infinity, -Infinity), { gainDb: 0, wantedDb: 0, limited: false });
});

test('correzione manuale: passi da 0,5 dB entro ±12', () => {
  assert.equal(clampTrim(3.3), 3.5);
  assert.equal(clampTrim(20), 12);
  assert.equal(clampTrim(-20), -12);
});

test('guadagno finale con e senza normalizzazione', () => {
  const n = normalization(-24, -8);
  assert.equal(appliedGainDb(n, true, -2), 4);
  assert.equal(appliedGainDb(n, false, -2), -2);
});
