// Motore audio minimo (spec §14.2): un AudioContext per tutta l'app, una voce = BufferSource → Gain di voce
// (inviluppo dei fade) → destinazione. I fade sono rampe sul clock audio, non timer JS.
import { AudioBuffer, AudioBufferSourceNode, AudioContext, GainNode } from 'react-native-audio-api';

const START_RAMP = 0.005; // micro-fade anti-click all'avvio (spec §5.2)
const STOP_RAMP = 0.02; // stop rapido

export interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  startedAt: number; // currentTime del contesto
  duration: number;
  loop: boolean;
  stopping: boolean;
}

export interface PlayOptions {
  loop?: boolean;
  fadeIn?: number;
  gainDb?: number;
  onEnded?: () => void;
}

let ctx: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function play(buffer: AudioBuffer, opts: PlayOptions = {}): Voice {
  const c = audioContext();
  const now = c.currentTime;
  const level = Math.pow(10, (opts.gainDb ?? 0) / 20);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(level, now + Math.max(START_RAMP, opts.fadeIn ?? 0));
  gain.connect(c.destination);

  const source = c.createBufferSource();
  source.buffer = buffer;
  source.loop = !!opts.loop;
  source.connect(gain);
  source.onEnded = () => {
    source.disconnect();
    gain.disconnect();
    opts.onEnded?.();
  };
  source.start(now);

  return { source, gain, startedAt: now, duration: buffer.duration, loop: !!opts.loop, stopping: false };
}

export function stop(voice: Voice, fade = STOP_RAMP) {
  if (voice.stopping) return;
  voice.stopping = true;
  const c = audioContext();
  const now = c.currentTime;
  const f = Math.max(STOP_RAMP, fade);
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
