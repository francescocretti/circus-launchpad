/// <reference types="node" />
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { extractEntry, readZipIndex, writeZip, type ZipSink, type ZipSource } from '../zip.ts';

const memSource = (b: Uint8Array): ZipSource => ({ size: b.length, read: (o, l) => b.slice(o, o + l) });

function memSink() {
  const parts: Uint8Array[] = [];
  const sink: ZipSink = { write: (b) => parts.push(b.slice()) };
  const bytes = () => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };
  return { sink, bytes };
}

const random = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 2654435761) >>> 24);

test('andata e ritorno: indice e contenuti identici', () => {
  const files = { 'set.json': new TextEncoder().encode('{"name":"TOUR 2026"}'), 'samples/abc.wav': random(3_500_000) };
  const out = memSink();
  writeZip(out.sink, Object.entries(files).map(([name, b]) => ({ name, source: memSource(b) })));
  const zip = memSource(out.bytes());
  const index = readZipIndex(zip);
  assert.deepEqual(index.map((e) => e.name), Object.keys(files));
  for (const e of index) {
    const back = memSink();
    extractEntry(zip, e, back.sink);
    assert.deepEqual(back.bytes(), files[e.name as keyof typeof files]);
  }
});

test('lo ZIP è leggibile da unzip di sistema', () => {
  const out = memSink();
  writeZip(out.sink, [{ name: 'samples/x.mp3', source: memSource(random(1000)) }]);
  const path = join(mkdtempSync(join(tmpdir(), 'circus-')), 't.circus');
  writeFileSync(path, out.bytes());
  const report = execFileSync('unzip', ['-t', path]).toString();
  assert.match(report, /No errors detected/);
});

test('un byte alterato fa fallire il controllo CRC', () => {
  const out = memSink();
  writeZip(out.sink, [{ name: 'a.bin', source: memSource(random(5000)) }]);
  const bytes = out.bytes();
  const zip = memSource(bytes);
  const [entry] = readZipIndex(zip);
  bytes[entry.dataOffset + 10] ^= 0xff;
  assert.throws(() => extractEntry(zip, entry, memSink().sink), /corrupted/);
});

test('file che non è uno ZIP', () => {
  assert.throws(() => readZipIndex(memSource(random(100))), /not a valid .circus file/);
});
