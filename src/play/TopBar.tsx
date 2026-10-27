// Barra superiore (spec §4.2, §6, §7.2): marchio, set, voci attive, EDIT/FINE e STOP generale.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, layout } from '../theme';

const STOP_HOLD_MS = 300;

interface Props {
  editing: boolean;
  setName: string;
  activeCount: number;
  /** Avanzamento della decodifica all'avvio (spec §8), null quando tutti i pad sono pronti. */
  startup: { done: number; total: number } | null;
  haptics: boolean;
  onToggleHaptics: () => void;
  onEdit: () => void;
  onDone: () => void;
  onStopAll: () => void;
}

export function TopBar({ editing, setName, activeCount, startup, haptics, onToggleHaptics, onEdit, onDone, onStopAll }: Props) {
  return (
    <View style={styles.bar}>
      {editing ? (
        <Text style={styles.editBadge}>EDIT</Text>
      ) : (
        <View style={styles.brand}>
          <View style={styles.marks}>
            {['#D9382C', '#EF8A33', '#F3BE3E', '#EEE5C6'].map((c) => (
              <View key={c} style={[styles.mark, { backgroundColor: c }]} />
            ))}
          </View>
          <Text style={styles.brandStrong}>CIRCUS</Text>
          <Text style={styles.brandLight}>LAUNCHPAD</Text>
        </View>
      )}
      <View style={styles.set}>
        <Text style={styles.muted}>SET</Text>
        <Text style={styles.setName}>{setName}</Text>
      </View>
      <View style={{ flex: 1 }} />
      {startup && (
        <Text style={[styles.muted, { color: colors.edit }]}>
          CARICAMENTO… {startup.done}/{startup.total}
        </Text>
      )}
      {editing ? (
        <>
          <Pressable onPress={onToggleHaptics} style={styles.outlineBtn} accessibilityRole="switch" accessibilityState={{ checked: haptics }}>
            <Text style={styles.btnText}>VIBRAZIONE {haptics ? 'ON' : 'OFF'}</Text>
          </Pressable>
          <Pressable onPress={onDone} style={[styles.outlineBtn, styles.doneBtn]}>
            <Text style={[styles.btnText, { color: colors.ink }]}>FINE ✓</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.muted}>{activeCount === 1 ? '1 VOCE' : `${activeCount} VOCI`}</Text>
          <Pressable onPress={onEdit} style={styles.outlineBtn}>
            <Text style={styles.btnText}>EDIT</Text>
          </Pressable>
        </>
      )}
      <StopButton enabled={activeCount > 0} onStop={onStopAll} />
    </View>
  );
}

/** STOP generale: si attiva tenendolo premuto 0,3 s (spec §6). */
function StopButton({ enabled, onStop }: { enabled: boolean; onStop: () => void }) {
  const [pressedAt, setPressedAt] = useState<number | null>(null);
  const [, setFrame] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pressedAt === null) return;
    let raf = requestAnimationFrame(function loop() {
      setFrame((f) => f + 1);
      raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  }, [pressedAt]);

  const release = () => {
    if (timer.current) clearTimeout(timer.current);
    setPressedAt(null);
  };
  const progress = pressedAt === null ? 0 : Math.min(1, (Date.now() - pressedAt) / STOP_HOLD_MS);

  return (
    <Pressable
      disabled={!enabled}
      onPressIn={() => {
        setPressedAt(Date.now());
        timer.current = setTimeout(() => {
          onStop();
          setPressedAt(null);
        }, STOP_HOLD_MS);
      }}
      onPressOut={release}
      accessibilityLabel="Ferma tutto (tieni premuto)"
      style={[styles.stop, enabled ? styles.stopOn : null]}
    >
      <View style={[styles.stopFill, { width: `${progress * 100}%` }]} />
      <Text style={[styles.btnText, { color: enabled ? '#ffd9d4' : '#6d665e' }]}>■ STOP</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: layout.barHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: layout.sideMargin,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.panelBorder,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marks: { flexDirection: 'row', gap: 2 },
  mark: { width: 6, height: 12, borderRadius: 1 },
  brandStrong: { fontFamily: fonts.label, fontSize: 17, letterSpacing: 2.4, color: colors.text },
  brandLight: { fontFamily: fonts.labelMedium, fontSize: 17, letterSpacing: 2.4, color: colors.textMuted },
  editBadge: {
    fontFamily: fonts.label,
    fontSize: 15,
    letterSpacing: 2.4,
    paddingHorizontal: 10,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: colors.edit,
    color: colors.ink,
  },
  set: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  muted: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.9, color: colors.textMuted },
  setName: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 0.9, color: colors.text },
  outlineBtn: { borderWidth: 1, borderColor: '#5a534c', borderRadius: 4, paddingHorizontal: 12, paddingVertical: 4 },
  doneBtn: { backgroundColor: colors.edit, borderColor: colors.edit },
  btnText: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1.3, color: colors.text },
  stop: {
    height: 24,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stopOn: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  stopFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.danger },
});
