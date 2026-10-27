// Modello dati dei pad (spec §10.1).

export type PadMode = 'oneshot' | 'loop';
export type Retrigger = 'stop' | 'restart' | 'ignore';

export interface SampleRef {
  id: string;
  fileName: string;
  durationSec: number;
  sampleRate: number;
  channels: number;
  loudnessLufs: number;
  truePeakDbtp: number;
}

export interface PadConfig {
  slot: number; // 1–12
  sample: SampleRef | null;
  label: string; // '' → si mostra fileName
  mode: PadMode;
  reverse: boolean;
  retrigger: Retrigger;
  retriggerTouched: boolean;
  fadeInSec: number;
  fadeOutSec: number;
  normalize: boolean;
  trimDb: number;
}

export const PAD_COUNT = 12;

export const defaultRetrigger = (mode: PadMode): Retrigger => (mode === 'loop' ? 'stop' : 'ignore');

export function emptyPad(slot: number): PadConfig {
  return {
    slot,
    sample: null,
    label: '',
    mode: 'oneshot',
    reverse: false,
    retrigger: defaultRetrigger('oneshot'),
    retriggerTouched: false,
    fadeInSec: 0,
    fadeOutSec: 1,
    normalize: true,
    trimDb: 0,
  };
}

export const padTitle = (p: PadConfig) => (p.label || p.sample?.fileName || '').toUpperCase();
