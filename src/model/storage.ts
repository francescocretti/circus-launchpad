// Persistenza su disco (spec §10, §14.3): copie dei sample, un JSON per set, stato dell'app.
//   documenti/samples/<sha256>.<ext>   copie dei file audio (condivise tra pad e set)
//   documenti/sets/<setId>.json         un file per set
//   documenti/state.json                ultimo set usato e impostazioni dell'app
//   documenti/sync.json                 stato della sync su Drive (spec §10.2)
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { emptyPad, PAD_COUNT, PadConfig } from './pads';
import { extractEntry, readZipIndex, writeZip, ZipSink, ZipSource } from './zip';

export interface PadSet {
  schemaVersion: 1;
  id: string;
  name: string;
  pads: PadConfig[];
  updatedAt: string;
}

export interface AppState {
  lastSetId: string;
  haptics: boolean;
}

const samplesDir = () => new Directory(Paths.document, 'samples');
const setsDir = () => new Directory(Paths.document, 'sets');
const stateFile = () => new File(Paths.document, 'state.json');
const syncFile = () => new File(Paths.document, 'sync.json');

function ensureDir(d: Directory) {
  if (!d.exists) d.create({ intermediates: true });
}

/** Scrittura atomica: file temporaneo e poi rinomina, così una chiusura brusca non lascia un JSON a metà. */
function writeJson(file: File, data: unknown) {
  const tmp = new File(file.uri + '.tmp');
  tmp.writeSync(JSON.stringify(data));
  tmp.moveSync(file, { overwrite: true });
}

function readJson<T>(file: File): T | null {
  if (!file.exists) return null;
  try {
    return JSON.parse(file.textSync()) as T;
  } catch {
    return null;
  }
}

const extension = (name: string) => {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(name);
  return m ? m[1].toLowerCase() : 'audio';
};

/**
 * Copia nella memoria privata dell'app un file scelto dall'utente (spec §8, D-18). Il nome della copia è
 * l'impronta SHA-256 del contenuto più l'estensione: lo stesso file caricato due volte occupa spazio una volta.
 * Restituisce l'id del sample (= nome della copia).
 */
export async function importSample(pickedUri: string, fileName: string): Promise<string> {
  const dir = samplesDir();
  ensureDir(dir);
  const tmp = new File(dir, `import-${Date.now()}.tmp`);
  await new File(pickedUri).copy(tmp);
  const id = `${await tmp.digest('SHA-256')}.${extension(fileName)}`;
  const dest = new File(dir, id);
  if (dest.exists) tmp.delete();
  else tmp.moveSync(dest);
  return id;
}

export const sampleUri = (id: string) => new File(samplesDir(), id).uri;
export const sampleExists = (id: string) => new File(samplesDir(), id).exists;
export const sampleFile = (id: string) => new File(samplesDir(), id);

const SAMPLE_ID = /^[0-9a-f]{64}\.[a-z0-9]{1,5}$/;

/** Id dei sample presenti sul telefono. */
export function listLocalSamples(): string[] {
  const dir = samplesDir();
  if (!dir.exists) return [];
  return dir
    .list()
    .filter((f): f is File => f instanceof File)
    .map((f) => decodeURIComponent(f.uri.split('/').filter(Boolean).pop()!))
    .filter((name) => SAMPLE_ID.test(name));
}

/**
 * Porta nella cartella dei sample un file scaricato, solo se il contenuto corrisponde all'id (SHA-256 + estensione):
 * un download troncato o sbagliato non deve mai diventare un sample.
 */
export async function adoptSample(tmp: File, id: string): Promise<boolean> {
  const ok = SAMPLE_ID.test(id) && `${await tmp.digest('SHA-256')}.${id.split('.').pop()}` === id;
  if (!ok) {
    tmp.delete();
    return false;
  }
  const dest = new File(samplesDir(), id);
  if (dest.exists) tmp.delete();
  else tmp.moveSync(dest);
  return true;
}

/** Cartella dei file temporanei dei download, accanto ai sample (stesso disco: la rinomina è immediata). */
export function downloadTarget(id: string): File {
  const dir = samplesDir();
  ensureDir(dir);
  return new File(dir, `download-${id}.tmp`);
}

export interface SyncStateFile {
  /** Hash di ogni set all'ultima sync riuscita (spec §10.2). */
  base: Record<string, string>;
  lastSync: string | null;
  mobileData: boolean;
}

export function loadSyncState(): SyncStateFile {
  return { base: {}, lastSync: null, mobileData: false, ...readJson<Partial<SyncStateFile>>(syncFile()) };
}

export function saveSyncState(state: SyncStateFile) {
  writeJson(syncFile(), state);
}

export function loadAppState(): AppState | null {
  return readJson<AppState>(stateFile());
}

export function saveAppState(state: AppState) {
  writeJson(stateFile(), state);
}

export function loadSet(id: string): PadSet | null {
  const set = readJson<PadSet>(new File(setsDir(), `${id}.json`));
  if (!set || set.schemaVersion !== 1) return null;
  // Uno slot mancante o in più (file modificato a mano, versioni future) non deve rompere la griglia.
  const pads = Array.from({ length: PAD_COUNT }, (_, i) => ({ ...emptyPad(i + 1), ...set.pads[i], slot: i + 1 }));
  return { ...set, pads };
}

export function saveSet(set: PadSet) {
  ensureDir(setsDir());
  writeJson(new File(setsDir(), `${set.id}.json`), { ...set, updatedAt: new Date().toISOString() });
}

export const newSetId = () => `set-${Date.now().toString(36)}`;

/** Tutti i set salvati, in ordine di nome. */
export function listSets(): PadSet[] {
  const dir = setsDir();
  if (!dir.exists) return [];
  return dir
    .list()
    .filter((f): f is File => f instanceof File && f.uri.endsWith('.json'))
    .map((f) => loadSet(decodeURIComponent(f.uri.split('/').pop()!.replace(/\.json$/, ''))))
    .filter((x): x is PadSet => x !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

export function deleteSet(id: string) {
  const f = new File(setsDir(), `${id}.json`);
  if (f.exists) f.delete();
}

/**
 * Cancella le copie dei sample che nessun set usa più, e i file temporanei rimasti da un'importazione
 * interrotta. Da chiamare quando non è in corso nessun caricamento (avvio, dopo l'eliminazione di un set).
 */
export function collectGarbage() {
  const dir = samplesDir();
  if (!dir.exists) return;
  const used = new Set(listSets().flatMap((set) => set.pads.map((p) => p.sample?.id).filter(Boolean)));
  for (const f of dir.list()) {
    const name = decodeURIComponent(f.uri.split('/').filter(Boolean).pop()!);
    if (f instanceof File && !used.has(name)) f.delete();
  }
}

function fileSource(file: File): ZipSource & { close: () => void } {
  const h = file.open(FileMode.ReadOnly);
  return {
    size: h.size ?? 0,
    read(offset, length) {
      h.offset = offset;
      return h.readBytesSync(length);
    },
    close: () => h.close(),
  };
}

function fileSink(file: File): ZipSink & { close: () => void } {
  if (file.exists) file.delete();
  file.create();
  const h = file.open(FileMode.WriteOnly);
  return { write: (b) => h.writeBytesSync(b), close: () => h.close() };
}

const safeFileName = (name: string) =>
  name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-') || 'set';

/**
 * Esporta un set come file .circus (ZIP con set.json e samples/), nella cache dell'app. Restituisce l'URI da
 * passare al menu di condivisione di Android.
 */
export function exportSet(set: PadSet): string {
  const cache = Paths.cache;
  const json = new File(cache, 'export-set.json');
  json.writeSync(JSON.stringify(set));
  const out = new File(cache, `${safeFileName(set.name)}.circus`);
  const ids = [...new Set(set.pads.map((p) => p.sample?.id).filter((x): x is string => !!x))];
  const sources = [
    { name: 'set.json', src: fileSource(json) },
    ...ids.filter(sampleExists).map((id) => ({ name: `samples/${id}`, src: fileSource(new File(samplesDir(), id)) })),
  ];
  const sink = fileSink(out);
  try {
    writeZip(sink, sources.map((s) => ({ name: s.name, source: s.src })));
  } finally {
    sink.close();
    sources.forEach((s) => s.src.close());
    json.delete();
  }
  return out.uri;
}

/**
 * Importa un file .circus come **nuovo** set (non sovrascrive mai): copia i sample che mancano e restituisce il
 * set già salvato. Se il nome è già usato aggiunge "(IMPORTED)".
 */
export function importSet(uri: string): PadSet {
  const src = fileSource(new File(uri));
  try {
    const index = readZipIndex(src);
    const setEntry = index.find((e) => e.name === 'set.json');
    if (!setEntry) throw new Error('set.json missing: not a .circus file');
    const tmpJson = new File(Paths.cache, 'import-set.json');
    const jsonSink = fileSink(tmpJson);
    try {
      extractEntry(src, setEntry, jsonSink);
    } finally {
      jsonSink.close();
    }
    const imported = JSON.parse(tmpJson.textSync()) as PadSet;
    tmpJson.delete();
    if (imported.schemaVersion !== 1 || !Array.isArray(imported.pads)) throw new Error('unsupported file version');

    const dir = samplesDir();
    ensureDir(dir);
    for (const e of index) {
      if (!e.name.startsWith('samples/')) continue;
      const id = e.name.slice('samples/'.length);
      if (!SAMPLE_ID.test(id) || sampleExists(id)) continue;
      const tmp = new File(dir, `import-${Date.now()}.tmp`);
      const sink = fileSink(tmp);
      try {
        extractEntry(src, e, sink);
      } finally {
        sink.close();
      }
      tmp.moveSync(new File(dir, id));
    }

    const names = new Set(listSets().map((x) => x.name));
    const name = names.has(imported.name) ? `${imported.name} (IMPORTED)` : imported.name;
    const set: PadSet = { ...imported, id: newSetId(), name };
    saveSet(set);
    return loadSet(set.id)!;
  } finally {
    src.close();
  }
}

export function newSet(id: string, name: string): PadSet {
  return {
    schemaVersion: 1,
    id,
    name,
    pads: Array.from({ length: PAD_COUNT }, (_, i) => emptyPad(i + 1)),
    updatedAt: new Date().toISOString(),
  };
}
