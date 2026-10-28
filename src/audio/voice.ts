// Primitive audio di basso livello (spec §14.2): un AudioContext per tutta l'app, una voce = BufferSource →
// Gain di voce (inviluppo dei fade) → uscita. I fade sono rampe sul clock audio, non timer JS.
import { AudioBuffer, AudioBufferSourceNode, AudioContext, AudioNode, GainNode } from 'react-native-audio-api';

export const START_RAMP = 0.005; // micro-fade anti-click all'avvio (spec §5.2)
export const STOP_RAMP = 0.02; // stop rapido, anche per STOP generale (spec §6)

export interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  startedAt: number; // currentTime del contesto
  duration: number;
  loop: boolean;
  /** Inizio e durata della dissolvenza di uscita; null finché la voce non viene fermata. */
  fadeStartedAt: number | null;
  fadeDuration: number;
  ended: boolean;
}

export interface PlayOptions {
  loop?: boolean;
  fadeIn?: number;
  /** Nodo a cui collegare la voce; di default l'uscita del contesto. */
  output?: AudioNode;
  onEnded?: (voice: Voice) => void;
}

const WATCHDOG_MS = 1000;
const STALL_TICKS = 2; // secondi di clock fermo prima di ricreare il contesto

let ctx: AudioContext | null = null;
let watchdog: ReturnType<typeof setInterval> | null = null;
const resetListeners = new Set<() => void>();

export function audioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    // Lo stream parte subito e resta sempre attivo: la libreria si riprende da sola da una disconnessione
    // (cambio di uscita, stream esclusivo preso da un'altra app) solo se lo stream sta girando. Uno stream
    // aperto ma mai avviato resta invece muto per sempre.
    void ctx.resume();
    startWatchdog();
  }
  return ctx;
}

/** Avvisa quando il contesto è stato ricreato: nodi e voci del vecchio contesto non valgono più. */
export function onContextReset(listener: () => void): () => void {
  resetListeners.add(listener);
  return () => resetListeners.delete(listener);
}

/**
 * Rete di sicurezza: se il clock audio resta fermo (stream disconnesso e non recuperato), chiude il contesto
 * e ne crea uno nuovo. I buffer non dipendono dal contesto e restano validi.
 */
function startWatchdog() {
  if (watchdog) return;
  let last = -1;
  let stalled = 0;
  watchdog = setInterval(() => {
    if (!ctx) return;
    const now = ctx.currentTime;
    stalled = now === last ? stalled + 1 : 0;
    last = now;
    if (stalled === 1) void ctx.resume();
    if (stalled < STALL_TICKS) return;
    const old = ctx;
    ctx = null;
    stalled = 0;
    last = -1;
    void old.close();
    audioContext();
    resetListeners.forEach((l) => l());
  }, WATCHDOG_MS);
}

export function play(buffer: AudioBuffer, opts: PlayOptions = {}): Voice {
  const c = audioContext();
  const now = c.currentTime;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + Math.max(START_RAMP, opts.fadeIn ?? 0));
  gain.connect(opts.output ?? c.destination);

  const source = c.createBufferSource();
  source.buffer = buffer;
  source.loop = !!opts.loop;
  source.connect(gain);

  const voice: Voice = {
    source,
    gain,
    startedAt: now,
    duration: buffer.duration,
    loop: !!opts.loop,
    fadeStartedAt: null,
    fadeDuration: 0,
    ended: false,
  };
  source.onEnded = () => {
    voice.ended = true;
    source.disconnect();
    gain.disconnect();
    opts.onEnded?.(voice);
  };
  source.start(now);
  return voice;
}

/**
 * Ferma la voce con una dissolvenza che parte dal livello attuale. Una seconda chiamata può solo accorciare
 * una dissolvenza in corso (es. STOP generale durante un fade lungo), mai allungarla.
 */
export function stop(voice: Voice, fade = STOP_RAMP) {
  if (voice.ended) return;
  const c = audioContext();
  const now = c.currentTime;
  const f = Math.max(STOP_RAMP, fade);
  if (voice.fadeStartedAt !== null && voice.fadeStartedAt + voice.fadeDuration <= now + f) return;
  voice.fadeStartedAt = now;
  voice.fadeDuration = f;
  voice.gain.gain.cancelAndHoldAtTime(now);
  voice.gain.gain.linearRampToValueAtTime(0, now + f);
  voice.source.stop(now + f + 0.01);
}

export function reversed(buffer: AudioBuffer): AudioBuffer {
  const c = audioContext();
  const out = c.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    out.copyToChannel(buffer.getChannelData(ch).slice().reverse(), ch);
  }
  return out;
}

/** Click secco e breve (sinusoide smorzata) per misurare la latenza tocco → suono. */
export function clickBuffer(freq: number): AudioBuffer {
  const c = audioContext();
  const sr = c.sampleRate;
  const len = Math.round(sr * 0.06);
  const buf = c.createBuffer(1, len, sr);
  const data = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    data[i] = 0.9 * Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 80);
  }
  buf.copyToChannel(data, 0);
  return buf;
}
