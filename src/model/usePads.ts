// Stato dei 12 pad e sincronizzazione con il motore audio. Ogni modifica a un pad viene riportata subito su
// PadEngine (volume subito, il resto dal lancio successivo: spec §7.1). La persistenza arriva in M3.
import { useCallback, useRef, useState } from 'react';
import { PadEngine } from '../audio/engine';
import { appliedGainDb, normalization } from '../audio/gain';
import { analyzeSample, decodeSample } from '../audio/sample';
import { defaultRetrigger, emptyPad, PAD_COUNT, PadConfig } from './pads';

export const engine = new PadEngine();

function syncEngine(p: PadConfig) {
  const gainDb = p.sample
    ? appliedGainDb(normalization(p.sample.loudnessLufs, p.sample.truePeakDbtp), p.normalize, p.trimDb)
    : 0;
  engine.configure(p.slot, {
    loop: p.mode === 'loop',
    reverse: p.reverse,
    fadeInSec: p.fadeInSec,
    fadeOutSec: p.fadeOutSec,
    gainDb,
  });
}

export type LoadState = { slot: number; status: 'loading' | 'error'; message: string };

export function usePads() {
  const [pads, setPads] = useState<PadConfig[]>(() => Array.from({ length: PAD_COUNT }, (_, i) => emptyPad(i + 1)));
  const [loadState, setLoadState] = useState<LoadState | null>(null);
  const padsRef = useRef(pads);

  const commit = (next: PadConfig[]) => {
    padsRef.current = next;
    setPads(next);
  };

  const update = useCallback((slot: number, patch: Partial<PadConfig>) => {
    const next = padsRef.current.map((p) => {
      if (p.slot !== slot) return p;
      const n = { ...p, ...patch };
      // Il default "al ritocco" segue la modalità finché l'utente non l'ha scelto a mano (spec §5.1).
      if (patch.retrigger !== undefined) n.retriggerTouched = true;
      else if (patch.mode && !p.retriggerTouched) n.retrigger = defaultRetrigger(patch.mode);
      syncEngine(n);
      return n;
    });
    commit(next);
  }, []);

  const load = useCallback(
    async (slot: number, uri: string, fileName: string) => {
      setLoadState({ slot, status: 'loading', message: 'DECODIFICA…' });
      try {
        const decoded = await decodeSample(uri);
        setLoadState({ slot, status: 'loading', message: 'ANALISI…' });
        // Lascia disegnare il messaggio prima del calcolo, che blocca il thread JS per qualche secondo.
        await new Promise((r) => setTimeout(r, 30));
        const loud = analyzeSample(decoded.buffer);
        engine.setBuffer(slot, decoded.buffer);
        update(slot, {
          sample: {
            id: `${fileName}-${Date.now()}`, // l'hash del contenuto arriva con la copia dei file in M3
            fileName,
            durationSec: decoded.durationSec,
            sampleRate: decoded.sampleRate,
            channels: decoded.channels,
            loudnessLufs: loud.lufs,
            truePeakDbtp: loud.truePeakDbtp,
          },
        });
        setLoadState(null);
      } catch (e) {
        setLoadState({ slot, status: 'error', message: `ERRORE: ${String(e)}` });
      }
    },
    [update],
  );

  const clear = useCallback((slot: number) => {
    engine.setBuffer(slot, null);
    const fresh = emptyPad(slot);
    syncEngine(fresh);
    commit(padsRef.current.map((p) => (p.slot === slot ? fresh : p)));
  }, []);

  return { pads, update, load, clear, loadState };
}
