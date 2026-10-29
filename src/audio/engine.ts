// Motore dei pad (spec §5, §14.2). Ogni slot ha il suo buffer (già invertito se il pad è in reverse), un
// GainNode di pad (normalizzazione + correzione) e al massimo una voce. La UI chiede lo stato con
// `snapshot()` a ogni frame e si iscrive a `subscribe()` per i cambi di fase (partenza, fine, stop).
import { AudioBuffer, GainNode } from 'react-native-audio-api';
import { dbToLinear } from './gain';
import { audioContext, onContextReset, play, reversed, stop, STOP_RAMP, Voice } from './voice';

export type PadPhase = 'idle' | 'playing' | 'fading';

export interface PadSettings {
  loop: boolean;
  reverse: boolean;
  fadeInSec: number;
  fadeOutSec: number;
  gainDb: number;
}

export interface PadSnapshot {
  phase: PadPhase;
  duration: number;
  /** Secondi dall'inizio del buffer (per i loop, posizione nel ciclo). */
  position: number;
  /** Ripetizione corrente, da 1 (solo loop). */
  loopCount: number;
  /** 0 → 1 durante la dissolvenza di uscita. */
  fadeProgress: number;
}

interface Slot {
  forward: AudioBuffer | null;
  backward: AudioBuffer | null; // creato al primo uso del reverse e tenuto finché il buffer non cambia
  settings: PadSettings;
  padGain: GainNode;
  voice: Voice | null;
}

// Versione invertita di ogni buffer, condivisa dai pad con lo stesso sample in reverse; si libera con il buffer.
const backwards = new WeakMap<AudioBuffer, AudioBuffer>();
function backwardOf(buffer: AudioBuffer): AudioBuffer {
  let b = backwards.get(buffer);
  if (!b) {
    b = reversed(buffer);
    backwards.set(buffer, b);
  }
  return b;
}

const DEFAULT_SETTINGS: PadSettings = { loop: false, reverse: false, fadeInSec: 0, fadeOutSec: 1, gainDb: 0 };
const GAIN_SMOOTHING = 0.02; // costante di tempo per i cambi di volume a voce attiva

export class PadEngine {
  private slots = new Map<number, Slot>();
  private listeners = new Set<(slot: number) => void>();

  constructor() {
    onContextReset(() => this.rebuild());
  }

  /** Dopo un nuovo contesto: le voci in corso sono perse, i gain di pad si ricreano con il volume attuale. */
  private rebuild() {
    const c = audioContext();
    for (const [n, s] of this.slots) {
      if (s.voice) s.voice.ended = true;
      s.voice = null;
      s.padGain = c.createGain();
      s.padGain.gain.value = dbToLinear(s.settings.gainDb);
      s.padGain.connect(c.destination);
      this.emit(n);
    }
  }

  private slot(n: number): Slot {
    let s = this.slots.get(n);
    if (!s) {
      const c = audioContext();
      const padGain = c.createGain();
      padGain.connect(c.destination);
      s = { forward: null, backward: null, settings: { ...DEFAULT_SETTINGS }, padGain, voice: null };
      this.slots.set(n, s);
    }
    return s;
  }

  private emit(n: number) {
    this.listeners.forEach((l) => l(n));
  }

  subscribe(listener: (slot: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Assegna (o toglie, con null) il buffer di uno slot. Una voce in corso si ferma subito. */
  setBuffer(n: number, buffer: AudioBuffer | null) {
    const s = this.slot(n);
    if (s.voice) stop(s.voice);
    s.forward = buffer;
    s.backward = null;
    if (buffer && s.settings.reverse) s.backward = backwardOf(buffer);
  }

  /**
   * Aggiorna le impostazioni. Volume subito; modalità, direzione e fade valgono dal lancio successivo
   * (spec §7.1).
   */
  configure(n: number, patch: Partial<PadSettings>) {
    const s = this.slot(n);
    s.settings = { ...s.settings, ...patch };
    if (s.settings.reverse && s.forward && !s.backward) s.backward = backwardOf(s.forward);
    if (patch.gainDb !== undefined) {
      const c = audioContext();
      s.padGain.gain.setTargetAtTime(dbToLinear(patch.gainDb), c.currentTime, GAIN_SMOOTHING);
    }
  }

  isLoaded(n: number): boolean {
    return !!this.slots.get(n)?.forward;
  }

  /** Fa partire il pad dall'inizio; se stava suonando, la voce precedente si chiude con lo stop rapido. */
  start(n: number) {
    const s = this.slot(n);
    const buffer = s.settings.reverse ? s.backward : s.forward;
    if (!buffer) return;
    if (s.voice) stop(s.voice);
    const voice = play(buffer, {
      loop: s.settings.loop,
      fadeIn: s.settings.fadeInSec,
      output: s.padGain,
      onEnded: (v) => {
        if (s.voice === v) {
          s.voice = null;
          this.emit(n);
        }
      },
    });
    s.voice = voice;
    this.emit(n);
  }

  /** Ferma il pad con il suo fade out, oppure con lo stop rapido (`fast`). */
  stop(n: number, { fast = false } = {}) {
    const s = this.slots.get(n);
    if (!s?.voice) return;
    stop(s.voice, fast ? STOP_RAMP : s.settings.fadeOutSec);
    this.emit(n);
  }

  /** STOP generale: tutte le voci con lo stop rapido, ignorando i fade dei pad (spec §6). */
  stopAll() {
    for (const n of this.slots.keys()) this.stop(n, { fast: true });
  }

  activeCount(): number {
    let count = 0;
    for (const s of this.slots.values()) if (s.voice && s.voice.fadeStartedAt === null) count++;
    return count;
  }

  snapshot(n: number): PadSnapshot {
    const s = this.slots.get(n);
    const duration = s?.forward?.duration ?? 0;
    const v = s?.voice;
    if (!v || v.ended) return { phase: 'idle', duration, position: 0, loopCount: 0, fadeProgress: 0 };
    const now = audioContext().currentTime;
    const elapsed = Math.max(0, now - v.startedAt);
    const fading = v.fadeStartedAt !== null;
    return {
      phase: fading ? 'fading' : 'playing',
      duration,
      position: v.loop ? elapsed % v.duration : Math.min(elapsed, v.duration),
      loopCount: v.loop ? Math.floor(elapsed / v.duration) + 1 : 1,
      fadeProgress: fading ? Math.min(1, (now - v.fadeStartedAt!) / v.fadeDuration) : 0,
    };
  }
}
