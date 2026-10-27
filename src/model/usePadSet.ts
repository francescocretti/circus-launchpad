// Stato del set attivo e sincronizzazione con motore audio e disco (spec §7, §8, §10).
// - All'avvio: legge l'ultimo set, configura i pad e decodifica i sample uno alla volta; ogni pad diventa
//   suonabile appena è pronto.
// - Ogni modifica va subito su PadEngine (volume subito, il resto dal lancio successivo) e su disco
//   (salvataggio automatico, raggruppato in 300 ms).
import { useCallback, useEffect, useRef, useState } from 'react';
import { PadEngine } from '../audio/engine';
import { appliedGainDb, normalization } from '../audio/gain';
import { analyzeSample, decodeSample } from '../audio/sample';
import { defaultRetrigger, emptyPad, PadConfig } from './pads';
import {
  AppState,
  importSample,
  loadAppState,
  loadSet,
  newSet,
  PadSet,
  sampleExists,
  sampleUri,
  saveAppState,
  saveSet,
} from './storage';

export const engine = new PadEngine();

const DEFAULT_SET_ID = 'default';
const SAVE_DELAY_MS = 300;

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

/** Messaggio per pad durante caricamento o in caso di errore; assente quando il pad è pronto. */
export type PadStatus = { kind: 'busy' | 'error'; message: string };

function readInitial() {
  const app = loadAppState() ?? { lastSetId: DEFAULT_SET_ID, haptics: true };
  const set = loadSet(app.lastSetId) ?? newSet(app.lastSetId, 'SET 1');
  const toLoad = set.pads.filter((p) => p.sample).map((p) => p.slot);
  return { app, set, toLoad };
}

export function usePadSet() {
  // Lettura sincrona da disco al primo render: niente setState a cascata nell'effetto di avvio.
  const [initial] = useState(readInitial);
  const [set, setSet] = useState<PadSet>(initial.set);
  const [app, setApp] = useState<AppState>(initial.app);
  const [statuses, setStatuses] = useState<Record<number, PadStatus>>(() =>
    Object.fromEntries(initial.toLoad.map((slot) => [slot, { kind: 'busy', message: 'CARICAMENTO…' } as PadStatus])),
  );
  const [startup, setStartup] = useState<{ done: number; total: number } | null>(
    initial.toLoad.length ? { done: 0, total: initial.toLoad.length } : null,
  );
  const setRef = useRef<PadSet>(initial.set);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setStatus = (slot: number, status: PadStatus | null) =>
    setStatuses((s) => {
      const next = { ...s };
      if (status) next[slot] = status;
      else delete next[slot];
      return next;
    });

  const commit = useCallback((next: PadSet) => {
    setRef.current = next;
    setSet(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveSet(next), SAVE_DELAY_MS);
  }, []);

  // Avvio: configura il motore e decodifica i sample del set, uno alla volta.
  useEffect(() => {
    initial.set.pads.forEach(syncEngine);
    (async () => {
      for (const [i, slot] of initial.toLoad.entries()) {
        const id = initial.set.pads[slot - 1].sample!.id;
        try {
          if (!sampleExists(id)) throw new Error('file mancante');
          const decoded = await decodeSample(sampleUri(id));
          engine.setBuffer(slot, decoded.buffer);
          syncEngine(setRef.current.pads[slot - 1]);
          setStatus(slot, null);
        } catch {
          setStatus(slot, { kind: 'error', message: 'ERRORE' });
        }
        setStartup(i + 1 < initial.toLoad.length ? { done: i + 1, total: initial.toLoad.length } : null);
      }
    })();
  }, [initial]);

  const update = useCallback(
    (slot: number, patch: Partial<PadConfig>) => {
      const cur = setRef.current;
      const pads = cur.pads.map((p) => {
        if (p.slot !== slot) return p;
        const n = { ...p, ...patch };
        // Il default "al ritocco" segue la modalità finché l'utente non l'ha scelto a mano (spec §5.1).
        if (patch.retrigger !== undefined) n.retriggerTouched = true;
        else if (patch.mode && !p.retriggerTouched) n.retrigger = defaultRetrigger(patch.mode);
        syncEngine(n);
        return n;
      });
      commit({ ...cur, pads });
    },
    [commit],
  );

  const load = useCallback(
    async (slot: number, pickedUri: string, fileName: string) => {
      try {
        setStatus(slot, { kind: 'busy', message: 'COPIA…' });
        const id = await importSample(pickedUri, fileName);
        setStatus(slot, { kind: 'busy', message: 'DECODIFICA…' });
        const decoded = await decodeSample(sampleUri(id));
        setStatus(slot, { kind: 'busy', message: 'ANALISI…' });
        // Lascia disegnare il messaggio prima del calcolo, che blocca il thread JS per qualche secondo.
        await new Promise((r) => setTimeout(r, 30));
        const loud = analyzeSample(decoded.buffer);
        engine.setBuffer(slot, decoded.buffer);
        update(slot, {
          sample: {
            id,
            fileName,
            durationSec: decoded.durationSec,
            sampleRate: decoded.sampleRate,
            channels: decoded.channels,
            loudnessLufs: loud.lufs,
            truePeakDbtp: loud.truePeakDbtp,
          },
        });
        setStatus(slot, null);
      } catch (e) {
        setStatus(slot, { kind: 'error', message: `ERRORE: ${e instanceof Error ? e.message : String(e)}` });
      }
    },
    [update],
  );

  const clear = useCallback(
    (slot: number) => {
      const cur = setRef.current;
      engine.setBuffer(slot, null);
      const fresh = emptyPad(slot);
      syncEngine(fresh);
      setStatus(slot, null);
      commit({ ...cur, pads: cur.pads.map((p) => (p.slot === slot ? fresh : p)) });
    },
    [commit],
  );

  const setHaptics = useCallback((haptics: boolean) => {
    setApp((a) => {
      const next = { ...a, haptics };
      saveAppState(next);
      return next;
    });
  }, []);

  return { set, statuses, startup, haptics: app.haptics, setHaptics, update, load, clear };
}
