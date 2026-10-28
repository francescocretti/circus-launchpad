// Login Google per la sync su Drive (spec §10.2, D-36). Credential Manager + AuthorizationClient tramite
// react-native-nitro-google-signin. Nel codice va solo l'ID del client Web: i client Android (release e debug)
// Google li riconosce da package e SHA-1 della firma.
import {
  GoogleOneTapSignIn,
  isCancelledResponse,
  isErrorWithCode,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
  statusCodes,
  type OneTapResponse,
} from 'react-native-nitro-google-signin';

const WEB_CLIENT_ID = '580168397214-bucrfmupsn85cj6gmif6j1n8klsk6soi.apps.googleusercontent.com';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

GoogleOneTapSignIn.configure({ webClientId: WEB_CLIENT_ID, scopes: [DRIVE_SCOPE] });

export interface Account {
  id: string;
  email: string;
}

const toAccount = (r: OneTapResponse): Account | null =>
  isSuccessResponse(r) && r.data ? { id: r.data.user.id, email: r.data.user.email ?? r.data.user.name ?? '' } : null;

/** Account dell'ultimo login, letto senza mostrare niente all'utente. */
export function currentAccount(): Account | null {
  const u = GoogleOneTapSignIn.getCurrentUser()?.user;
  return u ? { id: u.id, email: u.email ?? u.name ?? '' } : null;
}

/** Login interattivo. null se l'utente annulla. */
export async function signIn(): Promise<Account | null> {
  await GoogleOneTapSignIn.checkPlayServices();
  try {
    let r = await GoogleOneTapSignIn.signIn();
    if (isNoSavedCredentialFoundResponse(r)) r = await GoogleOneTapSignIn.createAccount();
    if (isNoSavedCredentialFoundResponse(r)) r = await GoogleOneTapSignIn.presentExplicitSignIn();
    if (isCancelledResponse(r)) return null;
    const account = toAccount(r);
    // Il consenso a drive.file arriva con la prima richiesta del token.
    if (account) await GoogleOneTapSignIn.getTokens();
    return account;
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return null;
    throw e;
  }
}

export async function signOut(): Promise<void> {
  await GoogleOneTapSignIn.signOut();
}

/** Token di accesso per Drive; con `stale` scarta prima quello in cache (dopo un 401). */
export async function accessToken(stale?: string): Promise<string> {
  if (stale) await GoogleOneTapSignIn.clearCachedAccessToken(stale);
  return (await GoogleOneTapSignIn.getTokens()).accessToken;
}

/** Messaggio leggibile (in inglese, per la UI) per un errore di login. */
export function authErrorMessage(e: unknown): string {
  if (isErrorWithCode(e)) {
    if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return 'Google Play services not available';
    if (e.code === statusCodes.DEVELOPER_ERROR) return 'Google sign-in is not set up for this build';
    if (e.code === statusCodes.IN_PROGRESS) return 'Sign-in already in progress';
  }
  return e instanceof Error ? e.message : String(e);
}
