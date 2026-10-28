// Stato della sync per la UI (spec §10.2). Per ora (M6, passo 1) gestisce solo login, logout e la
// preparazione della cartella su Drive; la sync dei set arriva nei passi successivi (§15.7).
import { useCallback, useState } from 'react';
import { Account, authErrorMessage, currentAccount, signIn as googleSignIn, signOut as googleSignOut } from './auth';
import { ensureFolders } from './drive';

export interface SyncState {
  account: Account | null;
  busy: boolean;
  error: string | null;
  signIn: () => void;
  signOut: () => void;
}

export function useSync(): SyncState {
  const [account, setAccount] = useState<Account | null>(() => currentAccount());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);

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

  return { account, busy, error, signIn, signOut };
}
