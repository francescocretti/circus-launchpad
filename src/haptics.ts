// Feedback aptico (spec §5.3.1): un solo tipo di colpo, secco. Su Pixel 7a KEYBOARD_TAP e VIRTUAL_KEY sono
// risultati troppo leggeri; LONG_PRESS è il "click pesante" di sistema.
import * as Haptics from 'expo-haptics';

export function tap(enabled: boolean) {
  if (enabled) Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Long_Press).catch(() => {});
}
