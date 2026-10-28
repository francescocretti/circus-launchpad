// Client minimo di Drive API v3 (spec §10.2). I file dell'app si riconoscono dalle `appProperties`, non dal
// nome: rinominarli o spostarli dentro la cartella su Drive non rompe niente.
//   circusRole=root|sets|samples        le tre cartelle
//   circusRole=set, setId, hash         un JSON per set (hash del contenuto, vedi plan.ts)
//   circusRole=sample, sampleId         un file audio, sampleId = SHA-256 + estensione come sul telefono
import { File } from 'expo-file-system';
import type { PadSet } from '../model/storage';
import { accessToken } from './auth';
import type { RemoteSet } from './plan';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const ROOT_FOLDER_NAME = 'Circus Launchpad Backup';
const ROLE = 'circusRole';

export class DriveError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`Drive ${status}: ${body.slice(0, 200)}`);
  }
}

/** Chiamata autenticata; su 401 rinnova il token una volta. */
async function request(url: string, init: RequestInit = {}): Promise<Response> {
  let token = await accessToken();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url.startsWith('http') ? url : `${API}${url}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 && attempt === 0) {
      token = await accessToken(token);
      continue;
    }
    if (!res.ok) throw new DriveError(res.status, await res.text());
    return res;
  }
}

interface DriveFile {
  id: string;
  name: string;
  appProperties?: Record<string, string>;
}

/** Tutti i file dell'app con un certo ruolo, non nel cestino (paginato). */
async function listByRole(role: string): Promise<DriveFile[]> {
  const q = `appProperties has { key='${ROLE}' and value='${role}' } and trashed=false`;
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q,
      fields: 'nextPageToken,files(id,name,appProperties)',
      pageSize: '1000',
      spaces: 'drive',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const page = (await (await request(`/files?${params}`)).json()) as { files: DriveFile[]; nextPageToken?: string };
    out.push(...page.files);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

async function createFolder(name: string, role: string, parent?: string): Promise<string> {
  const res = await request('/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, appProperties: { [ROLE]: role }, parents: parent ? [parent] : undefined }),
  });
  return ((await res.json()) as { id: string }).id;
}

export interface Folders {
  root: string;
  sets: string;
  samples: string;
  /** Almeno una cartella è stata appena creata (prima sync, o cancellata su Drive): la base non vale più. */
  fresh: boolean;
}

/** Trova o crea la cartella dell'app con le sottocartelle `Sets/` e `Samples/`. */
export async function ensureFolders(): Promise<Folders> {
  let fresh = false;
  const find = async (role: string, name: string, parent?: string) => {
    const found = (await listByRole(role))[0]?.id;
    if (found) return found;
    fresh = true;
    return createFolder(name, role, parent);
  };
  const root = await find('root', ROOT_FOLDER_NAME);
  const sets = await find('sets', 'Sets', root);
  const samples = await find('samples', 'Samples', root);
  return { root, sets, samples, fresh };
}

export async function listRemoteSets(): Promise<RemoteSet[]> {
  return (await listByRole('set'))
    .filter((f) => f.appProperties?.setId && f.appProperties.hash)
    .map((f) => ({
      id: f.appProperties!.setId,
      fileId: f.id,
      name: f.name.replace(/\.json$/, ''),
      hash: f.appProperties!.hash,
    }));
}

/** sampleId → id del file su Drive. */
export async function listRemoteSamples(): Promise<Map<string, string>> {
  const files = await listByRole('sample');
  return new Map(files.filter((f) => f.appProperties?.sampleId).map((f) => [f.appProperties!.sampleId, f.id]));
}

export async function readSet(fileId: string): Promise<PadSet> {
  const set = (await (await request(`/files/${fileId}?alt=media`)).json()) as PadSet;
  if (set?.schemaVersion !== 1 || !Array.isArray(set.pads)) throw new Error('Unsupported set file on Drive');
  return set;
}

/** Crea (senza `fileId`) o aggiorna il JSON di un set. Restituisce l'id del file su Drive. */
export async function writeSet(folders: Folders, set: PadSet, hash: string, fileId?: string): Promise<string> {
  const boundary = `circus-${Date.now().toString(36)}`;
  const meta = fileId
    ? { name: `${set.name}.json`, appProperties: { hash } }
    : {
        name: `${set.name}.json`,
        mimeType: 'application/json',
        parents: [folders.sets],
        appProperties: { [ROLE]: 'set', setId: set.id, hash },
      };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(set, null, 2)}\r\n--${boundary}--`;
  const res = await request(
    fileId ? `${UPLOAD}/files/${fileId}?uploadType=multipart&fields=id` : `${UPLOAD}/files?uploadType=multipart&fields=id`,
    { method: fileId ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
  );
  return ((await res.json()) as { id: string }).id;
}

/** Nel cestino di Drive: recuperabile per 30 giorni. */
export async function trash(fileId: string): Promise<void> {
  await request(`/files/${fileId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
}

/** Nome leggibile su Drive: `kick loop · a1b2c3.wav`. */
export function sampleDriveName(sampleId: string, fileName?: string): string {
  const ext = sampleId.split('.').pop()!;
  const base = (fileName ?? '').replace(/\.[^.]+$/, '').trim() || 'sample';
  return `${base} · ${sampleId.slice(0, 6)}.${ext}`;
}

type Progress = (done: number, total: number) => void;

/**
 * Carica un sample con l'upload resumable: la sessione si apre con fetch, poi il file parte direttamente dal
 * disco (nessuna copia in memoria JS).
 */
export async function uploadSample(folders: Folders, file: File, sampleId: string, name: string, onProgress?: Progress) {
  const meta = { name, parents: [folders.samples], appProperties: { [ROLE]: 'sample', sampleId } };
  const init = await request(`${UPLOAD}/files?uploadType=resumable&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(file.size) },
    body: JSON.stringify(meta),
  });
  const session = init.headers.get('Location');
  if (!session) throw new Error('Drive did not return an upload session');
  const res = await file.upload(session, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    onProgress: onProgress && ((p) => onProgress(p.bytesSent, p.totalBytes)),
  });
  if (res.status !== 200 && res.status !== 201) throw new DriveError(res.status, res.body);
}

/** Scarica un sample direttamente su `dest` (file temporaneo); su 401 rinnova il token una volta. */
export async function downloadSample(fileId: string, dest: File, onProgress?: Progress): Promise<void> {
  let token = await accessToken();
  for (let attempt = 0; ; attempt++) {
    try {
      await File.downloadFileAsync(`${API}/files/${fileId}?alt=media`, dest, {
        headers: { Authorization: `Bearer ${token}` },
        idempotent: true,
        onProgress: onProgress && ((p) => onProgress(p.bytesWritten, p.totalBytes)),
      });
      return;
    } catch (e) {
      if (attempt === 0 && /\b401\b/.test(String(e))) {
        token = await accessToken(token);
        continue;
      }
      throw e;
    }
  }
}
