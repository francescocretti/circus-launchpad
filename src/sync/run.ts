// Esegue una sync completa (spec §10.2): cartelle, piano dei set (plan.ts), poi i sample. Lo stato (la base)
// si salva dopo ogni azione riuscita, così una sync interrotta riparte da dove era arrivata.
import { Platform } from 'react-native';
import {
  adoptSample,
  deleteSet,
  downloadTarget,
  listLocalSamples,
  listSets,
  loadSet,
  loadSyncState,
  newSetId,
  PadSet,
  sampleFile,
  saveSet,
  saveSyncState,
} from '../model/storage';
import {
  downloadSample,
  ensureFolders,
  listRemoteSamples,
  listRemoteSets,
  readSet,
  sampleDriveName,
  trash,
  uploadSample,
  writeSet,
} from './drive';
import { planSamples, planSets, setHash, toLocalSet } from './plan';

export interface SyncProgress {
  phase: 'sets' | 'samples';
  done: number;
  total: number;
}

export interface SyncOptions {
  /**
   * Si può sostituire o cancellare questo set sul telefono adesso? No per il set attivo in PLAY (spec §10.2):
   * l'azione si salta e la prossima sync la ripropone.
   */
  canReplace: (setId: string) => boolean;
  onProgress?: (p: SyncProgress) => void;
  /** Un sample è appena arrivato sul telefono. */
  onSample?: (id: string) => void;
}

export interface SyncResult {
  /** Set cambiati o cancellati sul telefono: la UI li ricarica. */
  changed: string[];
  deleted: string[];
  /** Azioni rimandate perché toccavano un set che non si poteva sostituire. */
  deferred: string[];
  /** Sample usati da un set ma assenti sia qui sia su Drive. */
  missing: string[];
}

/** "Pixel 7a" → "PIXEL 7A", per il suffisso dei nomi doppi alla prima sync. */
const deviceName = () => String((Platform.constants as { Model?: string }).Model ?? 'PHONE').toUpperCase();

export async function runSync({ canReplace, onProgress, onSample }: SyncOptions): Promise<SyncResult> {
  const folders = await ensureFolders();
  const base: Record<string, string> = folders.fresh ? {} : { ...loadSyncState().base };
  // Si rilegge il file a ogni salvataggio: l'interruttore MOBILE DATA può cambiare durante la sync.
  const commit = (extra: { lastSync?: string } = {}) => saveSyncState({ ...loadSyncState(), base, ...extra });
  commit();

  const remote = await listRemoteSets();
  const actions = planSets({
    local: listSets().map(toLocalSet),
    remote,
    base,
    device: deviceName(),
    newId: newSetId,
  });

  const result: SyncResult = { changed: [], deleted: [], deferred: [], missing: [] };
  const upload = async (set: PadSet, fileId?: string) => {
    const hash = setHash(set);
    await writeSet(folders, set, hash, fileId);
    base[set.id] = hash;
  };
  const download = async (id: string, fileId: string, hash: string) => {
    const set = await readSet(fileId);
    saveSet({ ...set, id });
    base[id] = hash;
    result.changed.push(id);
  };
  const remoteHash = new Map(remote.map((r) => [r.id, r.hash]));

  let done = 0;
  for (const a of actions) {
    onProgress?.({ phase: 'sets', done: done++, total: actions.length });
    const touchesLocal = a.kind === 'download' || a.kind === 'conflict' || a.kind === 'deleteLocal';
    if (touchesLocal && loadSet(a.id) && !canReplace(a.id)) {
      result.deferred.push(a.id);
      continue;
    }
    switch (a.kind) {
      case 'upload': {
        let set = loadSet(a.id)!;
        if (a.rename) {
          set = { ...set, name: a.rename };
          saveSet(set);
          result.changed.push(set.id);
        }
        await upload(set, a.fileId);
        break;
      }
      case 'download':
        await download(a.id, a.fileId, remoteHash.get(a.id)!);
        break;
      case 'conflict': {
        // Prima si mette al sicuro la versione locale come set nuovo, poi si scarica quella di Drive al suo posto.
        const copy = { ...loadSet(a.id)!, id: a.copyId, name: a.copyName };
        saveSet(copy);
        result.changed.push(copy.id);
        await upload(copy);
        await download(a.id, a.fileId, remoteHash.get(a.id)!);
        break;
      }
      case 'deleteLocal':
        deleteSet(a.id);
        delete base[a.id];
        result.deleted.push(a.id);
        break;
      case 'trashRemote':
        await trash(a.fileId);
        delete base[a.id];
        break;
      case 'record':
        base[a.id] = a.hash;
        break;
      case 'forget':
        delete base[a.id];
        break;
    }
    commit();
  }

  // Sample: quelli usati dai set del telefono. Se qualcosa è stato rimandato, telefono e Drive non sono ancora
  // uguali: per prudenza in questo giro non si cestina niente.
  const sets = listSets();
  const fileNames = new Map(
    sets.flatMap((s) => s.pads.flatMap((p) => (p.sample ? [[p.sample.id, p.sample.fileName] as const] : []))),
  );
  const remoteSamples = await listRemoteSamples();
  const plan = planSamples(fileNames.keys(), listLocalSamples(), remoteSamples.keys());
  const steps = plan.upload.length + plan.download.length;
  let n = 0;
  for (const id of plan.upload) {
    onProgress?.({ phase: 'samples', done: n++, total: steps });
    await uploadSample(folders, sampleFile(id), id, sampleDriveName(id, fileNames.get(id)));
  }
  for (const id of plan.download) {
    onProgress?.({ phase: 'samples', done: n++, total: steps });
    const tmp = downloadTarget(id);
    await downloadSample(remoteSamples.get(id)!, tmp);
    if (!(await adoptSample(tmp, id))) throw new Error(`Downloaded sample does not match: ${id}`);
    onSample?.(id);
  }
  if (result.deferred.length === 0) for (const id of plan.trash) await trash(remoteSamples.get(id)!);
  result.missing = plan.missing;

  commit({ lastSync: new Date().toISOString() });
  return result;
}
