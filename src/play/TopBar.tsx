// Barra superiore (spec §4.2, §6, §7.2): marchio, set, voci attive, EDIT/FINE e STOP generale.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AudioOutput, OutputKind } from '../../modules/audio-output/src';
import { SyncIcon } from '../sync/SyncIcon';
import { colors, fonts, layout } from '../theme';

const STOP_HOLD_MS = 300;

interface Props {
  editing: boolean;
  setName: string;
  activeCount: number;
  /** Avanzamento della decodifica all'avvio (spec §8), null quando tutti i pad sono pronti. */
  startup: { done: number; total: number } | null;
  haptics: boolean;
  output: AudioOutput;
  /** L'uscita è appena cambiata: si evidenzia per qualche secondo. */
  outputChanged: boolean;
  onToggleHaptics: () => void;
  onEdit: () => void;
  onOpenSets: () => void;
  onOpenChecklist: () => void;
  onOpenSync: () => void;
  /** Sync in corso e ultimo esito (spec §10.2). */
  syncBusy: boolean;
  syncError: boolean;
  /** Messaggio breve dopo una sync, es. SET UPDATED. */
  notice: string | null;
  onDone: () => void;
  onStopAll: () => void;
}

export function TopBar({ editing, setName, activeCount, startup, haptics, output, outputChanged, onToggleHaptics, onEdit, onOpenSets, onOpenChecklist, onOpenSync, syncBusy, syncError, notice, onDone, onStopAll }: Props) {
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
      {editing ? (
        <Pressable onPress={onOpenSets} style={[styles.set, styles.setButton]} accessibilityLabel="Manage sets">
          <Text style={styles.muted}>SET</Text>
          <Text style={styles.setName}>{setName}</Text>
          <Text style={[styles.setName, { color: colors.edit }]}>▾</Text>
        </Pressable>
      ) : (
        <View style={styles.set}>
          <Text style={styles.muted}>SET</Text>
          <Text style={styles.setName}>{setName}</Text>
          {syncBusy && (
            <View style={{ alignSelf: 'center' }}>
              <SyncIcon busy size={11} />
            </View>
          )}
        </View>
      )}
      <View style={{ flex: 1 }} />
      {notice && <Text style={[styles.muted, { color: colors.edit }]}>{notice}</Text>}
      {startup && (
        <Text style={[styles.muted, { color: colors.edit }]}>
          LOADING… {startup.done}/{startup.total}
        </Text>
      )}
      <OutputIndicator output={output} changed={outputChanged} />
      {editing ? (
        <>
          <Pressable onPress={onOpenChecklist} style={styles.outlineBtn}>
            <Text style={styles.btnText}>CHECKLIST</Text>
          </Pressable>
          <Pressable onPress={onOpenSync} style={[styles.outlineBtn, styles.syncBtn]} accessibilityLabel="Sync">
            <SyncIcon busy={syncBusy} error={syncError} size={15} />
            <Text style={[styles.btnText, syncError && { color: colors.danger }]}>SYNC</Text>
          </Pressable>
          <Pressable onPress={onToggleHaptics} style={styles.outlineBtn} accessibilityRole="switch" accessibilityState={{ checked: haptics }}>
            <Text style={styles.btnText}>HAPTICS {haptics ? 'ON' : 'OFF'}</Text>
          </Pressable>
          <Pressable onPress={onDone} style={[styles.outlineBtn, styles.doneBtn]}>
            <Text style={[styles.btnText, { color: colors.ink }]}>DONE ✓</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.muted}>{activeCount === 1 ? '1 VOICE' : `${activeCount} VOICES`}</Text>
          <Pressable onPress={onEdit} style={styles.outlineBtn}>
            <Text style={styles.btnText}>EDIT</Text>
          </Pressable>
        </>
      )}
      <StopButton enabled={activeCount > 0} onStop={onStopAll} />
    </View>
  );
}

const OUTPUT_LABEL: Record<OutputKind, string> = {
  usb: 'USB-C',
  wired: 'WIRED',
  bluetooth: 'BLUETOOTH · HIGH LATENCY',
  speaker: 'SPEAKER',
  other: 'OTHER',
  unknown: '—',
};
const OUTPUT_COLOR: Record<OutputKind, string> = {
  usb: colors.ok,
  wired: colors.ok,
  bluetooth: colors.danger,
  speaker: colors.edit,
  other: colors.textMuted,
  unknown: colors.textMuted,
};

/** Uscita audio (spec §11): verde cablata, ambra altoparlante, rosso Bluetooth; un cambio si evidenzia. */
function OutputIndicator({ output, changed }: { output: AudioOutput; changed: boolean }) {
  const color = OUTPUT_COLOR[output.kind];
  return (
    <View
      style={[styles.output, changed && { backgroundColor: color }]}
      accessibilityLabel={`Audio output: ${OUTPUT_LABEL[output.kind]}${output.name ? `, ${output.name}` : ''}`}
    >
      <View style={[styles.outputDot, { backgroundColor: changed ? colors.ink : color }]} />
      <Text style={[styles.btnText, { color: changed ? colors.ink : output.kind === 'bluetooth' ? colors.danger : colors.text }]}>
        {changed ? `OUTPUT → ${OUTPUT_LABEL[output.kind]}` : OUTPUT_LABEL[output.kind]}
      </Text>
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
      accessibilityLabel="Stop all (hold)"
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
  setButton: { borderWidth: 1, borderColor: colors.edit, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 3 },
  muted: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.9, color: colors.textMuted },
  setName: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 0.9, color: colors.text },
  outlineBtn: { borderWidth: 1, borderColor: '#5a534c', borderRadius: 4, paddingHorizontal: 12, paddingVertical: 4 },
  syncBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  doneBtn: { backgroundColor: colors.edit, borderColor: colors.edit },
  btnText: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1.3, color: colors.text },
  output: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, height: 24, borderRadius: 4 },
  outputDot: { width: 7, height: 7, borderRadius: 4 },
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
