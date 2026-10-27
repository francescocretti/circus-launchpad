/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { holdStops, onDown } from '../gesture.ts';

test('pad fermo o in dissolvenza: parte al contatto, qualunque sia il ritocco', () => {
  for (const r of ['stop', 'restart', 'ignore'] as const) {
    assert.equal(onDown('idle', r), 'start');
    assert.equal(onDown('fading', r), 'start');
  }
});

test('pad in riproduzione: azione del ritocco', () => {
  assert.equal(onDown('playing', 'stop'), 'stop');
  assert.equal(onDown('playing', 'restart'), 'restart-on-release');
  assert.equal(onDown('playing', 'ignore'), 'hold');
});

test('la pressione lunga ferma solo i tocchi in attesa', () => {
  assert.equal(holdStops('start'), false);
  assert.equal(holdStops('stop'), false);
  assert.equal(holdStops('hold'), true);
  assert.equal(holdStops('restart-on-release'), true);
});
