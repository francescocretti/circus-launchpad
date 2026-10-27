// Persistenza su disco (spec §10, §14.3): copie dei sample, un JSON per set, stato dell'app.
//   documenti/samples/<sha256>.<ext>   copie dei file audio (condivise tra pad e set)
//   documenti/sets/<setId>.json         un file per set
//   documenti/state.json                ultimo set usato e impostazioni dell'app
import { Directory, File, Paths } from 'expo-file-system';
import { emptyPad, PAD_COUNT, PadConfig } from './pads';

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

export function newSet(id: string, name: string): PadSet {
  return {
    schemaVersion: 1,
    id,
    name,
    pads: Array.from({ length: PAD_COUNT }, (_, i) => emptyPad(i + 1)),
    updatedAt: new Date().toISOString(),
  };
}
