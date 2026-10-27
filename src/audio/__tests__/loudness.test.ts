/// <reference types="node" />
// Casi di prova sul modello di EBU Tech 3341 (segnali sintetici: i file ufficiali EBU non sono nel repo).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measureLoudness } from '../loudness.ts';

const SR = 48000;

/** Sinusoide stereo a 1 kHz composta da segmenti [ampiezza di picco in dBFS, durata in s]. */
function sineSegments(segments: [number, number][], freq = 1000): Float32Array[] {
  const total = segments.reduce((n, [, d]) => n + Math.round(d * SR), 0);
  const x = new Float32Array(total);
  let i = 0;
  for (const [db, dur] of segments) {
    const amp = Math.pow(10, db / 20);
    const end = i + Math.round(dur * SR);
    for (; i < end; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR);
  }
  return [x, x.slice()];
}

const near = (actual: number, expected: number, tol: number) =>
  assert.ok(Math.abs(actual - expected) <= tol, `atteso ${expected} ±${tol}, ottenuto ${actual}`);

test('sinusoide stereo a −23 dBFS → −23 LUFS', () => {
  near(measureLoudness(sineSegments([[-23, 20]]), SR).integratedLufs, -23, 0.1);
});

test('sinusoide stereo a −33 dBFS → −33 LUFS', () => {
  near(measureLoudness(sineSegments([[-33, 20]]), SR).integratedLufs, -33, 0.1);
});

test('gating relativo: −36 / −23 / −36 dBFS → −23 LUFS', () => {
  const r = measureLoudness(sineSegments([[-36, 10], [-23, 60], [-36, 10]]), SR);
  near(r.integratedLufs, -23, 0.1);
});

test('gating assoluto: −72 / −36 / −23 / −36 / −72 dBFS → −23 LUFS', () => {
  const r = measureLoudness(sineSegments([[-72, 10], [-36, 10], [-23, 60], [-36, 10], [-72, 10]]), SR);
  near(r.integratedLufs, -23, 0.1);
});

test('campione sotto 1 s: si usa il momentary massimo', () => {
  const r = measureLoudness(sineSegments([[-23, 0.6]]), SR);
  assert.equal(r.lufs, r.momentaryMaxLufs);
  near(r.lufs, -23, 0.2);
});

test('campione sotto 400 ms: misura comunque un valore finito', () => {
  const r = measureLoudness(sineSegments([[-23, 0.25]]), SR);
  near(r.lufs, -23, 0.3);
});

test('silenzio: loudness e picchi a −∞', () => {
  const r = measureLoudness([new Float32Array(SR * 2)], SR);
  assert.equal(r.lufs, -Infinity);
  assert.equal(r.truePeakDbtp, -Infinity);
});

test('true peak: sinusoide a fs/4 sfasata di 45° ha il picco tra i campioni', () => {
  // I campioni valgono ±0,5·√½ (−9,03 dBFS), il picco reale è 0,5 (−6,02 dBFS).
  const x = new Float32Array(SR);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((Math.PI / 2) * i + Math.PI / 4);
  const r = measureLoudness([x], SR);
  near(r.peakDbfs, -9.03, 0.05);
  near(r.truePeakDbtp, -6.02, 0.3);
});

test('true peak non è mai sotto il picco sul campione', () => {
  const r = measureLoudness(sineSegments([[-3, 2]], 997), SR);
  assert.ok(r.truePeakDbtp >= r.peakDbfs);
  near(r.truePeakDbtp, -3, 0.1);
});
