// Uscita audio corrente (spec §11): modulo nativo locale, solo Android.
import { requireNativeModule, type EventSubscription } from 'expo';

export type OutputKind = 'usb' | 'wired' | 'bluetooth' | 'speaker' | 'other' | 'unknown';

export interface AudioOutput {
  kind: OutputKind;
  name: string | null;
  type: number | null;
}

interface NativeModule {
  getCurrent(): AudioOutput;
  addListener(event: 'onChange', listener: (o: AudioOutput) => void): EventSubscription;
}

const native = requireNativeModule<NativeModule>('AudioOutput');

export const getCurrentOutput = (): AudioOutput => native.getCurrent();

export const addOutputListener = (listener: (o: AudioOutput) => void): EventSubscription =>
  native.addListener('onChange', listener);
