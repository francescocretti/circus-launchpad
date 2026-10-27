// Cosa fa un dito che tocca un pad (spec §5.3, §5.4). Logica pura, testata a parte.
import type { Retrigger } from '../model/pads';
import type { PadPhase } from '../audio/engine';

export const HOLD_TO_STOP_MS = 700;
export const HOLD_OVERLAY_DELAY_MS = 120;
export const IGNORED_HINT_MS = 1400;

/**
 * Azione al contatto del dito:
 * - `start`: parte subito (pad fermo o in dissolvenza);
 * - `stop`: fade out subito (ritocco STOP);
 * - `hold`: niente al contatto; la pressione lunga ferma, il rilascio anticipato mostra il suggerimento (IGNORA);
 * - `restart-on-release`: riparte al rilascio se arriva prima della pressione lunga, che invece ferma (RIPARTE).
 */
export type DownAction = 'start' | 'stop' | 'hold' | 'restart-on-release';

export function onDown(phase: PadPhase, retrigger: Retrigger): DownAction {
  if (phase !== 'playing') return 'start';
  if (retrigger === 'stop') return 'stop';
  if (retrigger === 'restart') return 'restart-on-release';
  return 'hold';
}

/** La pressione lunga ferma il pad solo per i tocchi che non hanno già agito al contatto. */
export const holdStops = (a: DownAction) => a === 'hold' || a === 'restart-on-release';
