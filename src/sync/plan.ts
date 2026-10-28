// Logica pura della sync (spec §10.2, M6 passo 2): dato cosa c'è sul telefono, cosa c'è su Drive e com'era
// tutto all'ultima sync riuscita, decide cosa fare. Niente rete né disco: si prova con `npm test`.
//
// Ogni set ha un hash del contenuto (senza `updatedAt`). Il telefono ricorda, per ogni set, l'hash dell'ultima
// sync (`base`); su Drive l'hash sta nelle appProperties del file. Così:
//   - cambiato sul telefono  = hash locale ≠ base
//   - cambiato su Drive      = hash remoto ≠ base
//   - cancellato sul telefono = manca in locale ma c'è in base (non serve un elenco a parte delle cancellazioni)
//   - cancellato su Drive     = manca su Drive ma c'è in base
import type { PadSet } from '../model/storage';

export interface LocalSet {
  id: string;
  name: string;
  hash: string;
  /** Nessun pad con un sample o un'etichetta: il set vuoto iniziale (spec §10.2, prima sync). */
  pristine: boolean;
}

export interface RemoteSet {
  id: string;
  fileId: string;
  name: string;
  hash: string;
}

export type SetAction =
  /** Carica il set locale; `fileId` se sostituisce un file esistente, `rename` se va prima rinominato. */
  | { kind: 'upload'; id: string; fileId?: string; rename?: string }
  /** Scarica il set da Drive e sostituisce (o crea) quello locale. */
  | { kind: 'download'; id: string; fileId: string }
  /** Cambiato da tutte e due le parti: la versione locale diventa `copyId` / `copyName` e sale; quella di
   *  Drive prende il posto di `id` sul telefono. */
  | { kind: 'conflict'; id: string; fileId: string; copyId: string; copyName: string }
  | { kind: 'deleteLocal'; id: string }
  | { kind: 'trashRemote'; id: string; fileId: string }
  /** Già uguali: si aggiorna solo la base. */
  | { kind: 'record'; id: string; hash: string }
  /** Cancellato da tutte e due le parti: si toglie dalla base. */
  | { kind: 'forget'; id: string };

export interface PlanInput {
  local: LocalSet[];
  remote: RemoteSet[];
  /** Hash di ogni set all'ultima sync riuscita. Vuota alla prima sync, o se la cartella su Drive è sparita. */
  base: Record<string, string>;
  /** Es. "PIXEL 7A": suffisso per i nomi doppi alla prima sync. */
  device: string;
  newId: () => string;
}

export const CONFLICT_SUFFIX = ' (CONFLICT)';

export function planSets({ local, remote, base, device, newId }: PlanInput): SetAction[] {
  const firstSync = Object.keys(base).length === 0;
  const L = new Map(local.map((s) => [s.id, s]));
  const R = new Map(remote.map((s) => [s.id, s]));
  const ids = [...new Set([...L.keys(), ...R.keys(), ...Object.keys(base)])].sort();
  const remoteNames = new Set(remote.map((s) => s.name));
  const actions: SetAction[] = [];

  for (const id of ids) {
    const l = L.get(id);
    const r = R.get(id);
    const b = base[id];

    if (l && r) {
      if (l.hash === r.hash) {
        if (b !== l.hash) actions.push({ kind: 'record', id, hash: l.hash });
        continue;
      }
      const localChanged = l.hash !== b;
      const remoteChanged = r.hash !== b;
      if (b !== undefined && localChanged && !remoteChanged) actions.push({ kind: 'upload', id, fileId: r.fileId });
      else if (b !== undefined && !localChanged && remoteChanged) actions.push({ kind: 'download', id, fileId: r.fileId });
      else actions.push({ kind: 'conflict', id, fileId: r.fileId, copyId: newId(), copyName: l.name + CONFLICT_SUFFIX });
    } else if (l) {
      if (b === undefined) {
        // Mai sincronizzato. Alla prima sync il set vuoto iniziale non sale; se Drive porta altri set, sul
        // telefono non serve più (è vuoto: non si perde niente).
        if (firstSync && l.pristine) {
          if (remote.length > 0) actions.push({ kind: 'deleteLocal', id });
          continue;
        }
        const clash = firstSync && remoteNames.has(l.name);
        actions.push({ kind: 'upload', id, rename: clash ? `${l.name} (${device})` : undefined });
      } else if (l.hash !== b) {
        // Cancellato su Drive ma modificato qui: vince la modifica.
        actions.push({ kind: 'upload', id });
      } else {
        actions.push({ kind: 'deleteLocal', id });
      }
    } else if (r) {
      if (b === undefined) actions.push({ kind: 'download', id, fileId: r.fileId });
      // Cancellato qui ma modificato su Drive: vince la modifica.
      else if (r.hash !== b) actions.push({ kind: 'download', id, fileId: r.fileId });
      else actions.push({ kind: 'trashRemote', id, fileId: r.fileId });
    } else {
      actions.push({ kind: 'forget', id });
    }
  }
  return actions;
}

export interface SamplePlan {
  upload: string[];
  download: string[];
  /** Su Drive ma non più usati da nessun set. */
  trash: string[];
  /** Usati da un set ma non presenti né qui né su Drive: il pad resterà in errore. */
  missing: string[];
}

/**
 * Sample da spostare, a sync dei set completata (quando telefono e Drive hanno gli stessi set).
 * `referenced`: id dei sample usati dai set dopo la sync.
 */
export function planSamples(referenced: Iterable<string>, local: Iterable<string>, remote: Iterable<string>): SamplePlan {
  const ref = new Set(referenced);
  const here = new Set(local);
  const there = new Set(remote);
  const sorted = (xs: Iterable<string>) => [...xs].sort();
  return {
    upload: sorted([...ref].filter((id) => here.has(id) && !there.has(id))),
    download: sorted([...ref].filter((id) => !here.has(id) && there.has(id))),
    trash: sorted([...there].filter((id) => !ref.has(id))),
    missing: sorted([...ref].filter((id) => !here.has(id) && !there.has(id))),
  };
}

/** JSON con le chiavi in ordine, così lo stesso contenuto dà sempre la stessa stringa. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

/** cyrb53: hash a 53 bit, veloce e senza dipendenze. Basta per riconoscere un cambio, non è crittografico. */
function cyrb53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Hash del contenuto di un set: tutto tranne `updatedAt`, che cambia a ogni salvataggio. */
export function setHash(set: PadSet): string {
  const { updatedAt: _ignored, ...content } = set;
  return cyrb53(stableStringify(content));
}

export const isPristine = (set: PadSet) => set.pads.every((p) => !p.sample && !p.label);

export const toLocalSet = (set: PadSet): LocalSet => ({
  id: set.id,
  name: set.name,
  hash: setHash(set),
  pristine: isPristine(set),
});
