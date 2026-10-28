/// <reference types="node" />
// Un caso per ogni regola della sync (spec §10.2).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPristine, planSamples, planSets, setHash, type LocalSet, type PlanInput, type RemoteSet } from '../plan.ts';

const loc = (id: string, hash: string, name = id.toUpperCase(), pristine = false): LocalSet => ({ id, name, hash, pristine });
const rem = (id: string, hash: string, name = id.toUpperCase()): RemoteSet => ({ id, fileId: `f-${id}`, name, hash });

function plan(p: Partial<PlanInput>) {
  let n = 0;
  return planSets({ local: [], remote: [], base: {}, device: 'PIXEL 7A', newId: () => `new-${++n}`, ...p });
}

test('niente di cambiato: nessuna azione', () => {
  assert.deepEqual(plan({ local: [loc('a', 'h1')], remote: [rem('a', 'h1')], base: { a: 'h1' } }), []);
});

test('cambiato solo sul telefono: si carica sul file esistente', () => {
  assert.deepEqual(plan({ local: [loc('a', 'h2')], remote: [rem('a', 'h1')], base: { a: 'h1' } }), [
    { kind: 'upload', id: 'a', fileId: 'f-a' },
  ]);
});

test('cambiato solo su Drive: si scarica', () => {
  assert.deepEqual(plan({ local: [loc('a', 'h1')], remote: [rem('a', 'h2')], base: { a: 'h1' } }), [
    { kind: 'download', id: 'a', fileId: 'f-a' },
  ]);
});

test('cambiato da tutte e due le parti: conflitto, la versione locale diventa una copia (CONFLICT)', () => {
  assert.deepEqual(plan({ local: [loc('a', 'h2', 'DEMO SHOW')], remote: [rem('a', 'h3')], base: { a: 'h1' } }), [
    { kind: 'conflict', id: 'a', fileId: 'f-a', copyId: 'new-1', copyName: 'DEMO SHOW (CONFLICT)' },
  ]);
});

test('cambiato da tutte e due le parti nello stesso modo: nessun conflitto, si aggiorna solo la base', () => {
  assert.deepEqual(plan({ local: [loc('a', 'h2')], remote: [rem('a', 'h2')], base: { a: 'h1' } }), [
    { kind: 'record', id: 'a', hash: 'h2' },
  ]);
});

test('set nuovo sul telefono: si carica', () => {
  assert.deepEqual(plan({ local: [loc('a', 'h1'), loc('b', 'h9')], remote: [rem('a', 'h1')], base: { a: 'h1' } }), [
    { kind: 'upload', id: 'b', rename: undefined },
  ]);
});

test('set nuovo su Drive: si scarica', () => {
  assert.deepEqual(plan({ local: [loc('a', 'h1')], remote: [rem('a', 'h1'), rem('b', 'h9')], base: { a: 'h1' } }), [
    { kind: 'download', id: 'b', fileId: 'f-b' },
  ]);
});

test('cancellato sul telefono: su Drive va nel cestino', () => {
  assert.deepEqual(plan({ local: [], remote: [rem('a', 'h1')], base: { a: 'h1' } }), [
    { kind: 'trashRemote', id: 'a', fileId: 'f-a' },
  ]);
});

test('cancellato su Drive: si cancella dal telefono', () => {
  assert.deepEqual(plan({ local: [loc('a', 'h1')], remote: [], base: { a: 'h1' } }), [{ kind: 'deleteLocal', id: 'a' }]);
});

test('cancellato sul telefono ma modificato su Drive: vince la modifica', () => {
  assert.deepEqual(plan({ local: [], remote: [rem('a', 'h2')], base: { a: 'h1' } }), [
    { kind: 'download', id: 'a', fileId: 'f-a' },
  ]);
});

test('cancellato su Drive ma modificato sul telefono: vince la modifica', () => {
  assert.deepEqual(plan({ local: [loc('a', 'h2')], remote: [], base: { a: 'h1' } }), [{ kind: 'upload', id: 'a' }]);
});

test('cancellato da tutte e due le parti: si toglie dalla base', () => {
  assert.deepEqual(plan({ base: { a: 'h1' } }), [{ kind: 'forget', id: 'a' }]);
});

test('prima sync: unione, il nome doppio sul telefono prende il suffisso del modello', () => {
  assert.deepEqual(
    plan({
      local: [loc('p1', 'h1', 'SET 1'), loc('p2', 'h2', 'ACOUSTIC')],
      remote: [rem('d1', 'h3', 'SET 1'), rem('d2', 'h4', 'TOUR')],
    }),
    [
      { kind: 'download', id: 'd1', fileId: 'f-d1' },
      { kind: 'download', id: 'd2', fileId: 'f-d2' },
      { kind: 'upload', id: 'p1', rename: 'SET 1 (PIXEL 7A)' },
      { kind: 'upload', id: 'p2', rename: undefined },
    ],
  );
});

test('prima sync: il set vuoto iniziale non sale e, se Drive porta altri set, sparisce dal telefono', () => {
  assert.deepEqual(plan({ local: [loc('default', 'h0', 'SET 1', true)], remote: [rem('d1', 'h3', 'TOUR')] }), [
    { kind: 'download', id: 'd1', fileId: 'f-d1' },
    { kind: 'deleteLocal', id: 'default' },
  ]);
});

test('prima sync con Drive vuoto: il set vuoto iniziale resta sul telefono e non sale', () => {
  assert.deepEqual(plan({ local: [loc('default', 'h0', 'SET 1', true)] }), []);
});

test('dopo la prima sync anche un set vuoto sale (es. appena creato con + NEW SET)', () => {
  assert.deepEqual(plan({ local: [loc('a', 'h1'), loc('b', 'h0', 'NEW', true)], remote: [rem('a', 'h1')], base: { a: 'h1' } }), [
    { kind: 'upload', id: 'b', rename: undefined },
  ]);
});

test('cartella su Drive sparita (base azzerata dal chiamante): niente cancellazioni, si ricarica tutto', () => {
  assert.deepEqual(plan({ local: [loc('a', 'h1'), loc('b', 'h2')], remote: [], base: {} }), [
    { kind: 'upload', id: 'a', rename: undefined },
    { kind: 'upload', id: 'b', rename: undefined },
  ]);
});

test('stesso id su entrambi senza base e contenuto diverso: conflitto, non si perde niente', () => {
  assert.deepEqual(plan({ local: [loc('a', 'h1', 'X')], remote: [rem('a', 'h2')] }), [
    { kind: 'conflict', id: 'a', fileId: 'f-a', copyId: 'new-1', copyName: 'X (CONFLICT)' },
  ]);
});

test('sample: si caricano quelli solo qui, si scaricano quelli solo su Drive, si cestinano quelli non più usati', () => {
  assert.deepEqual(planSamples(['s1', 's2', 's3', 's4'], ['s1', 's2', 'old-local'], ['s2', 's3', 'old-remote']), {
    upload: ['s1'],
    download: ['s3'],
    trash: ['old-remote'],
    missing: ['s4'],
  });
});

const pad = (slot: number, extra = {}) => ({
  slot,
  sample: null,
  label: '',
  mode: 'oneshot' as const,
  reverse: false,
  retrigger: 'ignore' as const,
  retriggerTouched: false,
  fadeInSec: 0,
  fadeOutSec: 1,
  normalize: true,
  trimDb: 0,
  ...extra,
});
const set = (extra = {}, pads = [pad(1), pad(2)]) => ({
  schemaVersion: 1 as const,
  id: 'a',
  name: 'SET 1',
  pads,
  updatedAt: '2026-10-28T10:00:00.000Z',
  ...extra,
});

test('hash: non dipende da updatedAt né dall\'ordine delle chiavi, cambia con il contenuto', () => {
  const h = setHash(set());
  assert.equal(setHash(set({ updatedAt: '2027-01-01T00:00:00.000Z' })), h);
  const reordered = JSON.parse(JSON.stringify({ updatedAt: 'x', pads: set().pads, name: 'SET 1', id: 'a', schemaVersion: 1 }));
  assert.equal(setHash(reordered), h);
  assert.notEqual(setHash(set({ name: 'SET 2' })), h);
  assert.notEqual(setHash(set({}, [pad(1, { trimDb: 0.5 }), pad(2)])), h);
});

test('set vuoto iniziale: nessun sample e nessuna etichetta', () => {
  assert.equal(isPristine(set()), true);
  assert.equal(isPristine(set({}, [pad(1, { label: 'INTRO' }), pad(2)])), false);
});
