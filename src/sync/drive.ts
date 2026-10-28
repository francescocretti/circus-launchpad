// Client minimo di Drive API v3 (spec §10.2). I file dell'app si riconoscono dalle `appProperties`, non dal
// nome: rinominare o spostare la cartella su Drive non rompe niente.
import { accessToken } from './auth';

const API = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const ROOT_FOLDER_NAME = 'Circus Launchpad Backup';
const ROLE = 'circusRole';

/** Chiamata autenticata; su 401 rinnova il token una volta. */
async function request(path: string, init: RequestInit = {}): Promise<Response> {
  let token = await accessToken();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 && attempt === 0) {
      token = await accessToken(token);
      continue;
    }
    if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res;
  }
}

async function findByRole(role: string): Promise<string | null> {
  const q = `appProperties has { key='${ROLE}' and value='${role}' } and trashed=false`;
  const res = await request(`/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
  const { files } = (await res.json()) as { files: { id: string }[] };
  return files[0]?.id ?? null;
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
}

/** Trova o crea la cartella dell'app con le sottocartelle `Sets/` e `Samples/`. */
export async function ensureFolders(): Promise<Folders> {
  const root = (await findByRole('root')) ?? (await createFolder(ROOT_FOLDER_NAME, 'root'));
  const sets = (await findByRole('sets')) ?? (await createFolder('Sets', 'sets', root));
  const samples = (await findByRole('samples')) ?? (await createFolder('Samples', 'samples', root));
  return { root, sets, samples };
}
