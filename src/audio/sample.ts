// Decodifica e analisi di un file audio al caricamento (spec §8, §9): una sola volta per file.
import { AudioBuffer } from 'react-native-audio-api';
import { LoudnessResult, measureLoudness } from './loudness';
import { audioContext } from './voice';

export interface DecodedSample {
  buffer: AudioBuffer;
  durationSec: number;
  sampleRate: number;
  channels: number;
  /** Byte occupati in RAM dal PCM float32 (per gli avvisi di memoria). */
  memoryBytes: number;
}

/** Decodifica il file alla frequenza del dispositivo. `uri` può essere un percorso o un URI `file://`. */
export async function decodeSample(uri: string): Promise<DecodedSample> {
  const buffer = await audioContext().decodeAudioData(uri);
  return {
    buffer,
    durationSec: buffer.duration,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    memoryBytes: buffer.length * buffer.numberOfChannels * 4,
  };
}

export function analyzeSample(buffer: AudioBuffer): LoudnessResult {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  return measureLoudness(channels, buffer.sampleRate);
}
