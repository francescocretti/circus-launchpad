// Stato della sync per la UI (spec §10.2): login, logout, sync (a richiesta o automatica), regola del Wi-Fi,
// ultima sync ed errore.
// - `request()` è il punto d'ingresso dei momenti automatici (apertura, uscita da EDIT) e di SYNC NOW: se la rete
//   non è permessa (dati mobili con MOBILE DATA OFF, o offline) la sync resta in attesa e parte da sola appena la
//   rete va bene.
// - L'errore resta (frecce rosse) finché una sync successiva non riesce.
import { NetworkStateType, useNetworkState } from 'expo-network';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSyncState, saveSyncState } from '../model/storage';
import { Account, authErrorMessage, currentAccount, signIn as googleSignIn, signOut as googleSignOut } from './auth';
import { ensureFolders } from './drive';
import { runSync, SyncOptions, SyncProgress, SyncResult } from './run';

export type SyncWait = 'wifi' | 'offline' | null;

export interface SyncState {
  account: Account | null;
  busy: boolean;
  progress: SyncProgress | null;
  error: string | null;
  lastSync: string | null;
  /** La sync aspetta la rete giusta. */
  waiting: SyncWait;
  mobileData: boolean;
  /** L'ultima sync ha lasciato in sospeso il set attivo (spec §10.2: si applica entrando in EDIT). */
  deferred: boolean;
  signIn: () => void;
  signOut: () => void;
  request: () => void;
  setMobileData: (on: boolean) => void;
}

interface Hooks {
  canReplace: SyncOptions['canReplace'];
  /** Prima di leggere i set da disco (salvataggi in sospeso). */
  beforeSync?: () => void;
  onSample?: (id: string) => void;
  onDone?: (r: SyncResult | null) => void;
}

const WIRED_TYPES = new Set([NetworkStateType.WIFI, NetworkStateType.ETHERNET]);

export function useSync(hooks: Hooks): SyncState {
  const [account, setAccount] = useState<Account | null>(() => currentAccount());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(() => loadSyncState().lastSync);
  const [mobileData, setMobileDataState] = useState(() => loadSyncState().mobileData);
  const [pending, setPending] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const running = useRef(false);
  const latest = useRef(hooks);
  useEffect(() => {
    latest.current = hooks;
  });

  const net = useNetworkState();
  const online = net.isConnected !== false && net.type !== NetworkStateType.NONE;
  const allowed = online && (mobileData || (net.type !== undefined && WIRED_TYPES.has(net.type)));
  const waitReason: SyncWait = online ? 'wifi' : 'offline';

  const run = useCallback(async (task: () => Promise<boolean>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      if (await task()) setError(null);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      running.current = false;
      setBusy(false);
      setProgress(null);
    }
  }, []);

  const doSync = useCallback(async () => {
    const h = latest.current;
    h.beforeSync?.();
    let result: SyncResult | null = null;
    try {
      result = await runSync({ canReplace: (id) => latest.current.canReplace(id), onProgress: setProgress, onSample: h.onSample });
      setLastSync(loadSyncState().lastSync);
      setDeferred(result.deferred.length > 0);
      return true;
    } finally {
      latest.current.onDone?.(result);
    }
  }, []);

  const request = useCallback(() => {
    if (!currentAccount()) return;
    setPending(true);
  }, []);

  // Parte appena c'è una richiesta e la rete è quella permessa.
  useEffect(() => {
    if (!pending || !allowed || !account || running.current) return;
    const t = setTimeout(() => {
      setPending(false);
      void run(doSync);
    }, 0);
    return () => clearTimeout(t);
  }, [pending, allowed, account, busy, run, doSync]);

  const signIn = useCallback(
    () =>
      run(async () => {
        const a = await googleSignIn();
        if (!a) return false;
        setAccount(a);
        await ensureFolders();
        setPending(true);
        return true;
      }),
    [run],
  );

  const signOut = useCallback(
    () =>
      run(async () => {
        await googleSignOut();
        setAccount(null);
        setPending(false);
        return true;
      }),
    [run],
  );

  const setMobileData = useCallback((on: boolean) => {
    setMobileDataState(on);
    saveSyncState({ ...loadSyncState(), mobileData: on });
  }, []);

  return {
    account,
    busy,
    progress,
    error,
    lastSync,
    waiting: pending && !allowed && !!account ? waitReason : null,
    mobileData,
    deferred,
    signIn,
    signOut,
    request,
    setMobileData,
  };
}
