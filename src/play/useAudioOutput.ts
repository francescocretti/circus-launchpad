// Uscita audio corrente e segnalazione dei cambi (spec §11): un cambio resta evidenziato per qualche secondo.
import { useEffect, useRef, useState } from 'react';
import { addOutputListener, AudioOutput, getCurrentOutput } from '../../modules/audio-output/src';

const CHANGE_HIGHLIGHT_MS = 6000;

export function useAudioOutput() {
  const [output, setOutput] = useState<AudioOutput>(getCurrentOutput);
  const [changedAt, setChangedAt] = useState<number | null>(null);
  const last = useRef(output);

  useEffect(() => {
    const sub = addOutputListener((o) => {
      // Il modulo nativo rilegge più volte dopo ogni cambio: le letture uguali si ignorano.
      if (o.kind === last.current.kind && o.name === last.current.name) return;
      setChangedAt(Date.now());
      last.current = o;
      setOutput(o);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (changedAt === null) return;
    const t = setTimeout(() => setChangedAt(null), CHANGE_HIGHLIGHT_MS);
    return () => clearTimeout(t);
  }, [changedAt]);

  return { output, changed: changedAt !== null };
}
