// Cursore orizzontale minimale (React Native non ne ha uno nel core). Il valore segue il dito ed è
// arrotondato a `step`; il centro della scala è segnato con una tacca.
import { useRef, useState } from 'react';
import { GestureResponderEvent, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

interface Props {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  accessibilityLabel: string;
}

const THUMB = 18;

export function Slider({ value, min, max, step, onChange, accessibilityLabel }: Props) {
  const [width, setWidth] = useState(1);
  const last = useRef(value);

  const fromX = (e: GestureResponderEvent) => {
    const x = Math.min(Math.max(e.nativeEvent.locationX - THUMB / 2, 0), width - THUMB);
    const raw = min + (x / Math.max(1, width - THUMB)) * (max - min);
    const v = Math.min(max, Math.max(min, Math.round(raw / step) * step));
    if (v !== last.current) {
      last.current = v;
      onChange(v);
    }
  };

  const pct = (value - min) / (max - min);
  const zero = (0 - min) / (max - min);

  return (
    <View
      style={styles.hit}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={fromX}
      onResponderMove={fromX}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) =>
        onChange(Math.min(max, Math.max(min, value + (e.nativeEvent.actionName === 'increment' ? step : -step))))
      }
    >
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.tick, { left: zero * (width - THUMB) + THUMB / 2 - 1 }]} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.thumb, { left: pct * (width - THUMB) }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 34, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.line },
  tick: { position: 'absolute', top: -4, width: 2, height: 12, backgroundColor: colors.textMuted },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.edit,
  },
});
