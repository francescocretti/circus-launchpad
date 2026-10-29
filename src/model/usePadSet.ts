// Stato del set attivo e sincronizzazione con motore audio e disco (spec §7, §8, §10).
// - All'avvio: legge l'ultimo set, configura i pad e decodifica i sample uno alla volta; ogni pad diventa
//   suonabile appena è pronto.
// - Ogni modifica va subito su PadEngine (volume subito, il resto dal lancio successivo) e su disco
//   (salvataggio automatico, raggruppato in 300 ms).
// - Set multipli (spec §10, M4): cambio, creazione, rinomina, duplicazione, eliminazione, esporta/importa .circus.
// - Sync su Drive (spec §10.2): applica i set cambiati dalla sync; un pad il cui sample sta ancora arrivando
//   mostra LOADING… e si carica da solo appena il file c'è, senza fermare gli altri pad.
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioBuffer } from 'react-native-audio-api';
import { PadEngine } from '../audio/engine';
import { appliedGainDb, normalization } from '../audio/gain';
import { analyzeSample, decodeSample } from '../audio/sample';
import { defaultRetrigger, emptyPad, PAD_COUNT, PadConfig } from './pads';
import {
  AppState,
  collectGarbage,
  deleteSet as deleteSetFile,
  exportSet,
  importSample,
  importSet,
  listSets,
  loadAppState,
  loadSet,
  newSet,
  newSetId,
  PadSet,
  sampleExists,
  sampleUri,
  saveAppState,
  saveSet,
} from './storage';

export const engine = new PadEngine();

const DEFAULT_SET_ID = 'default';
const SAVE_DELAY_MS = 300;
export const MAX_SET_NAME = 24;

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

const sampleIds = (set: PadSet) => new Set(set.pads.flatMap((p) => (p.sample ? [p.sample.id] : [])));
const loadedSlots = (set: PadSet) => set.pads.filter((p) => p.sample).map((p) => p.slot);
const busyStatuses = (slots: number[]) =>
  Object.fromEntries(slots.map((slot) => [slot, { kind: 'busy', message: 'LOADING…' } as PadStatus]));

function readInitial() {
  const app = loadAppState() ?? { lastSetId: DEFAULT_SET_ID, haptics: true };
  let set = loadSet(app.lastSetId);
  if (!set) {
    // Primo avvio, o ultimo set eliminato a mano: si riparte dal primo set esistente o da uno nuovo.
    set = listSets()[0] ?? newSet(app.lastSetId, 'SET 1');
    saveSet(set);
    app.lastSetId = set.id;
    saveAppState(app);
  }
  return { app, set, toLoad: loadedSlots(set) };
}

/** `samplesMayArrive`: all'avvio una sync può portare i sample mancanti (account collegato). */
export function usePadSet({ samplesMayArrive = false } = {}) {
  // Lettura sincrona da disco al primo render: niente setState a cascata nell'effetto di avvio.
  const [initial] = useState(readInitial);
  const [set, setSet] = useState<PadSet>(initial.set);
  const [app, setApp] = useState<AppState>(initial.app);
  const [statuses, setStatuses] = useState<Record<number, PadStatus>>(() => busyStatuses(initial.toLoad));
  const [startup, setStartup] = useState<{ done: number; total: number } | null>(
    initial.toLoad.length ? { done: 0, total: initial.toLoad.length } : null,
  );
  const setRef = useRef<PadSet>(initial.set);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0); // invalida le decodifiche di un set non più attivo
  const samplesPending = useRef(samplesMayArrive); // una sync può ancora portare i sample mancanti
  const waiting = useRef(new Set<number>()); // pad in attesa di un sample dalla sync
  // Un buffer decodificato per sample: i pad con lo stesso sample lo condividono (ogni voce ne riceve comunque
  // una copia sua dalla libreria, quindi restano indipendenti). L'id è l'hash del contenuto: un buffer in mappa
  // non è mai vecchio, al più inutilizzato, e `prune` lo toglie.
  const buffers = useRef(new Map<string, AudioBuffer>());

  const bufferFor = async (id: string) => {
    let buffer = buffers.current.get(id);
    if (!buffer) {
      buffer = (await decodeSample(sampleUri(id))).buffer;
      // Durante la decodifica il set può essere cambiato: si tiene solo se serve ancora.
      if (sampleIds(setRef.current).has(id)) buffers.current.set(id, buffer);
    }
    return buffer;
  };

  /** Libera i buffer dei sample che il set non usa più. */
  const prune = (target: PadSet) => {
    const used = sampleIds(target);
    for (const id of buffers.current.keys()) if (!used.has(id)) buffers.current.delete(id);
  };

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

  const flushSave = useCallback(() => {
    if (!saveTimer.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    saveSet(setRef.current);
  }, []);

  // Decodifica i sample di un set, uno alla volta; si interrompe se nel frattempo si cambia set.
  const decodeAll = useCallback(async (target: PadSet) => {
    const gen = ++generation.current;
    const slots = loadedSlots(target);
    for (const [i, slot] of slots.entries()) {
      const id = target.pads[slot - 1].sample!.id;
      let status: PadStatus | null = null;
      try {
        if (sampleExists(id)) {
          const buffer = await bufferFor(id);
          if (gen !== generation.current) return;
          engine.setBuffer(slot, buffer);
          syncEngine(setRef.current.pads[slot - 1]);
        } else if (samplesPending.current) {
          // Il sample sta arrivando con la sync: il pad resta in LOADING… e si carica con resolveWaiting.
          waiting.current.add(slot);
          status = { kind: 'busy', message: 'LOADING…' };
          await Promise.resolve();
        } else {
          throw new Error('missing file');
        }
      } catch {
        status = { kind: 'error', message: 'ERROR' };
      }
      if (gen !== generation.current) return;
      setStatus(slot, status);
      setStartup(i + 1 < slots.length ? { done: i + 1, total: slots.length } : null);
    }
  }, []);

  // Avvio: pulizia delle copie inutilizzate, poi motore e decodifica.
  useEffect(() => {
    collectGarbage();
    initial.set.pads.forEach(syncEngine);
    decodeAll(initial.set);
  }, [initial, decodeAll]);

  const saveLastSet = useCallback((id: string) => {
    setApp((a) => {
      const next = { ...a, lastSetId: id };
      saveAppState(next);
      return next;
    });
  }, []);

  /**
   * Rende attivo un set: ferma l'audio, svuota il motore e decodifica i nuovi sample. Con `discard` le modifiche
   * non ancora salvate si buttano (il set su disco è appena stato sostituito dalla sync).
   */
  const activate = useCallback(
    (next: PadSet, { discard = false } = {}) => {
      if (discard && saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      } else flushSave();
      waiting.current.clear();
      engine.stopAll();
      for (let slot = 1; slot <= PAD_COUNT; slot++) engine.setBuffer(slot, null);
      prune(next); // i sample in comune con il set precedente non si ridecodificano
      next.pads.forEach(syncEngine);
      setRef.current = next;
      setSet(next);
      const slots = loadedSlots(next);
      setStatuses(busyStatuses(slots));
      setStartup(slots.length ? { done: 0, total: slots.length } : null);
      saveLastSet(next.id);
      decodeAll(next);
    },
    [flushSave, decodeAll, saveLastSet],
  );

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
        setStatus(slot, { kind: 'busy', message: 'COPYING…' });
        const id = await importSample(pickedUri, fileName);
        // Stesso file già su un altro pad del set: buffer e misure si riusano.
        const known = setRef.current.pads.find((p) => p.sample?.id === id)?.sample;
        const buffer = buffers.current.get(id);
        if (known && buffer) {
          engine.setBuffer(slot, buffer);
          update(slot, { sample: { ...known, fileName } });
        } else {
          setStatus(slot, { kind: 'busy', message: 'DECODING…' });
          const decoded = await decodeSample(sampleUri(id));
          buffers.current.set(id, decoded.buffer);
          setStatus(slot, { kind: 'busy', message: 'ANALYZING…' });
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
        }
        prune(setRef.current); // il sample sostituito, se nessun altro pad lo usa
        setStatus(slot, null);
      } catch (e) {
        setStatus(slot, { kind: 'error', message: `ERROR: ${e instanceof Error ? e.message : String(e)}` });
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
      prune(setRef.current);
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

  const sets = useCallback(() => {
    flushSave();
    return listSets();
  }, [flushSave]);

  const switchSet = useCallback(
    (id: string) => {
      if (id === setRef.current.id) return;
      const next = loadSet(id);
      if (next) activate(next);
    },
    [activate],
  );

  const createSet = useCallback(() => {
    const names = new Set(listSets().map((x) => x.name));
    let n = names.size + 1;
    while (names.has(`SET ${n}`)) n++;
    const fresh = newSet(newSetId(), `SET ${n}`);
    saveSet(fresh);
    activate(fresh);
  }, [activate]);

  const renameSet = useCallback(
    (name: string) => commit({ ...setRef.current, name: name.toUpperCase().slice(0, MAX_SET_NAME) }),
    [commit],
  );

  const duplicateSet = useCallback(() => {
    flushSave();
    const cur = setRef.current;
    saveSet({ ...cur, id: newSetId(), name: `${cur.name} COPY`.slice(0, MAX_SET_NAME) });
  }, [flushSave]);

  /** Elimina il set attivo e passa a un altro. Non si può eliminare l'unico set. */
  const deleteSet = useCallback(() => {
    const cur = setRef.current;
    const others = listSets().filter((x) => x.id !== cur.id);
    if (others.length === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    deleteSetFile(cur.id);
    activate(others[0]);
    collectGarbage();
  }, [activate]);

  const exportActive = useCallback(async () => {
    flushSave();
    const uri = exportSet(setRef.current);
    await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: `Export ${setRef.current.name}` });
  }, [flushSave]);

  const importFile = useCallback(
    (uri: string) => {
      flushSave();
      activate(importSet(uri));
    },
    [flushSave, activate],
  );

  /** Dopo una sync: ricarica il set attivo se è cambiato o è stato cancellato. true se l'ha ricaricato. */
  const applySync = useCallback(
    (changed: string[], deleted: string[]) => {
      const cur = setRef.current;
      if (deleted.includes(cur.id)) {
        let next = listSets()[0];
        if (!next) {
          next = newSet(newSetId(), 'SET 1');
          saveSet(next);
        }
        activate(next, { discard: true });
        return true;
      }
      if (changed.includes(cur.id)) {
        const next = loadSet(cur.id);
        if (next) {
          activate(next, { discard: true });
          return true;
        }
      }
      return false;
    },
    [activate],
  );

  /** La sync può (true) o non può più (false) portare i sample mancanti. */
  const setSamplesPending = useCallback((pending: boolean) => {
    samplesPending.current = pending;
  }, []);

  /** Carica i pad in attesa i cui sample sono arrivati; con la sync finita, quelli ancora assenti vanno in ERROR. */
  const resolveWaiting = useCallback(async () => {
    const gen = generation.current;
    for (const slot of [...waiting.current]) {
      const id = setRef.current.pads[slot - 1].sample?.id;
      if (!id) {
        waiting.current.delete(slot);
        continue;
      }
      if (!sampleExists(id)) {
        if (!samplesPending.current) {
          waiting.current.delete(slot);
          setStatus(slot, { kind: 'error', message: 'ERROR' });
        }
        continue;
      }
      waiting.current.delete(slot);
      try {
        const buffer = await bufferFor(id);
        if (gen !== generation.current) return;
        engine.setBuffer(slot, buffer);
        syncEngine(setRef.current.pads[slot - 1]);
        setStatus(slot, null);
      } catch {
        if (gen === generation.current) setStatus(slot, { kind: 'error', message: 'ERROR' });
      }
    }
  }, []);

  return {
    set,
    flush: flushSave,
    applySync,
    setSamplesPending,
    resolveWaiting,
    statuses,
    startup,
    haptics: app.haptics,
    setHaptics,
    update,
    load,
    clear,
    sets,
    switchSet,
    createSet,
    renameSet,
    duplicateSet,
    deleteSet,
    exportActive,
    importFile,
  };
}
