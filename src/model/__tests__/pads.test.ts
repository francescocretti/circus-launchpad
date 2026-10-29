/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodedMB, emptyPad, type PadConfig } from '../pads.ts';

// 10 s stereo a 48 kHz in float32 = 3,84 MB.
const sample = (id: string) => ({ id, fileName: id, durationSec: 10, sampleRate: 48000, channels: 2, loudnessLufs: -18, truePeakDbtp: -3 });
const pad = (slot: number, id: string | null, reverse = false): PadConfig => ({ ...emptyPad(slot), sample: id ? sample(id) : null, reverse });

test('memoria: un sample su più pad si conta una volta, il reverse una volta in più', () => {
  assert.equal(decodedMB([pad(1, 'a'), pad(2, null)]), 3.84);
  assert.equal(decodedMB([pad(1, 'a'), pad(2, 'a')]), 3.84);
  assert.equal(decodedMB([pad(1, 'a'), pad(2, 'a', true), pad(3, 'a', true)]), 7.68);
  assert.equal(decodedMB([pad(1, 'a'), pad(2, 'b', true)]), 3.84 * 3);
});
