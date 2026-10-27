// Calcolo del guadagno di normalizzazione (spec §9): obiettivo −18 LUFS, tetto −1 dBTP, nessun limiter.

export const TARGET_LUFS = -18;
export const CEILING_DBTP = -1;
export const TRIM_MIN_DB = -12;
export const TRIM_MAX_DB = 12;

export interface Normalization {
  /** Guadagno da applicare in dB. */
  gainDb: number;
  /** Guadagno che servirebbe per arrivare all'obiettivo, senza il tetto. */
  wantedDb: number;
  /** true se il tetto di true peak ha ridotto il guadagno: in EDIT si mostra "limitato dal picco". */
  limited: boolean;
}

export function normalization(lufs: number, truePeakDbtp: number): Normalization {
  // File silenzioso o non misurabile: nessuna correzione.
  if (!isFinite(lufs)) return { gainDb: 0, wantedDb: 0, limited: false };
  const wantedDb = TARGET_LUFS - lufs;
  const maxDb = isFinite(truePeakDbtp) ? CEILING_DBTP - truePeakDbtp : wantedDb;
  return wantedDb > maxDb
    ? { gainDb: maxDb, wantedDb, limited: true }
    : { gainDb: wantedDb, wantedDb, limited: false };
}

export function clampTrim(db: number): number {
  return Math.min(TRIM_MAX_DB, Math.max(TRIM_MIN_DB, Math.round(db * 2) / 2));
}

/** Guadagno finale del pad: normalizzazione (se attiva) + correzione manuale. */
export function appliedGainDb(norm: Normalization, normalize: boolean, trimDb: number): number {
  return (normalize ? norm.gainDb : 0) + clampTrim(trimDb);
}

export const dbToLinear = (db: number) => Math.pow(10, db / 20);
