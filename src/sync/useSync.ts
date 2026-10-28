// Stato della sync per la UI (spec §10.2): login, logout, SYNC NOW, ultima sync ed errore.
// I momenti automatici (apertura, uscita da EDIT) e la regola del Wi-Fi arrivano con il passo 4 (§15.7).
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSyncState } from '../model/storage';
import { Account, authErrorMessage, currentAccount, signIn as googleSignIn, signOut as googleSignOut } from './auth';
import { ensureFolders } from './drive';
import { runSync, SyncProgress, SyncResult } from './run';

export interface SyncState {
  account: Account | null;
  busy: boolean;
  progress: SyncProgress | null;
  error: string | null;
  lastSync: string | null;
  signIn: () => void;
  signOut: () => void;
  syncNow: () => void;
}

/** `canReplace`: si può sostituire questo set sul telefono adesso? (vedi run.ts) */
export function useSync(canReplace: (setId: string) => boolean, onResult?: (r: SyncResult) => void): SyncState {
  const [account, setAccount] = useState<Account | null>(() => currentAccount());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(() => loadSyncState().lastSync);
  const running = useRef(false);
  const latest = useRef({ canReplace, onResult });
  useEffect(() => {
    latest.current = { canReplace, onResult };
  });

  const run = useCallback(async (task: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      running.current = false;
      setBusy(false);
      setProgress(null);
    }
  }, []);

  const syncNow = useCallback(
    () =>
      run(async () => {
        const result = await runSync({
          canReplace: (id) => latest.current.canReplace(id),
          onProgress: setProgress,
        });
        setLastSync(loadSyncState().lastSync);
        latest.current.onResult?.(result);
      }),
    [run],
  );

  const signIn = useCallback(
    () =>
      run(async () => {
        const a = await googleSignIn();
        if (!a) return;
        setAccount(a);
        await ensureFolders();
      }),
    [run],
  );

  const signOut = useCallback(
    () =>
      run(async () => {
        await googleSignOut();
        setAccount(null);
      }),
    [run],
  );

  return { account, busy, progress, error, lastSync, signIn, signOut, syncNow };
}
