// Le due frecce della sync (spec §10.2): ferme a riposo, girano durante la sync, rosse dopo un errore.
// Tracciato: icona "sync" di Material Icons (Apache 2.0), centrata nel riquadro 24×24 per girare sul proprio asse.
import { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme';

const TURN_MS = 1200;
const SYNC_PATH =
  'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z';

export function SyncIcon({ busy, error, size = 14 }: { busy: boolean; error?: boolean; size?: number }) {
  const [turn] = useState(() => new Animated.Value(0));
  const [rotate] = useState(() => turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] }));

  useEffect(() => {
    if (!busy) return;
    turn.setValue(0);
    const loop = Animated.loop(
      Animated.timing(turn, { toValue: 1, duration: TURN_MS, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => {
      loop.stop();
      turn.setValue(0);
    };
  }, [busy, turn]);

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={SYNC_PATH} fill={error ? colors.danger : colors.text} />
      </Svg>
    </Animated.View>
  );
}
