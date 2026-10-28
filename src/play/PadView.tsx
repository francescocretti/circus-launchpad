// Un pad della griglia (spec §4.3, §4.4). Solo disegno: i tocchi li gestisce la superficie unica di PadGrid.
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PadSnapshot } from '../audio/engine';
import { PadConfig, padTitle } from '../model/pads';
import type { PadStatus } from '../model/usePadSet';
import { colors, fonts, mix, PAD_COLORS, restColor } from '../theme';

export interface PadViewProps {
  pad: PadConfig;
  snap: PadSnapshot;
  /** 0 → 1 mentre si tiene premuto per fermare; null se non c'è una pressione lunga in corso. */
  hold: number | null;
  hint: boolean;
  blinkOn: boolean;
  editing: boolean;
  status?: PadStatus; // caricamento in corso o errore
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function PadViewImpl({ pad, snap, hold, hint, blinkOn, editing, status }: PadViewProps) {
  const color = PAD_COLORS[pad.slot - 1];
  const num = String(pad.slot).padStart(2, '0');

  if (!pad.sample) {
    return (
      <View style={[styles.pad, styles.empty, editing && styles.emptyEditing]}>
        <View style={styles.topRow}>
          <Text style={[styles.num, { color: colors.textDisabled }]}>{num}</Text>
          <View style={[styles.swatch, { backgroundColor: color }]} />
        </View>
        <Text style={[styles.label, styles.emptyLabel]}>{status?.message ?? 'EMPTY'}</Text>
        <Text style={[styles.file, { color: colors.textDisabled }]}>
          {editing ? 'tap to load' : 'load in EDIT'}
        </Text>
      </View>
    );
  }

  const playing = snap.phase === 'playing';
  const fading = snap.phase === 'fading';
  const intensity = playing ? 1 : fading ? 1 - snap.fadeProgress : 0;
  const lit = intensity > 0.5;
  const dur = pad.sample.durationSec;

  let time = fmt(dur);
  let pct = 0;
  if (playing || fading) {
    pct = dur > 0 ? (snap.position / dur) * 100 : 0;
    if (fading) {
      time = 'FADING OUT…';
      pct *= 1 - snap.fadeProgress;
    } else {
      time = pad.mode === 'loop' ? `∞ ×${snap.loopCount}` : `-${fmt(Math.max(0, dur - snap.position))}`;
    }
  }
  const ledOn = playing || (fading && blinkOn);
  if (status) time = status.kind === 'error' ? 'ERROR' : status.message;

  return (
    <View
      style={[
        styles.pad,
        { backgroundColor: mix(restColor(color), color, intensity) },
        playing ? { borderColor: color, boxShadow: `0 0 22px ${color}66` } : styles.restShadow,
        status?.kind === 'busy' && { opacity: 0.55 },
        status?.kind === 'error' && { borderColor: colors.danger },
      ]}
    >
      <View style={styles.topRow}>
        <Text style={[styles.num, { color: lit ? colors.ink : color }]}>{num}</Text>
        <Text style={[styles.badge, { color: lit ? colors.ink : colors.text }]}>
          {pad.mode === 'loop' ? '∞ LOOP' : '1 SHOT'}
        </Text>
        {pad.reverse && <Text style={[styles.badge, { color: lit ? colors.ink : colors.text }]}>◂ REV</Text>}
        <View style={{ flex: 1 }} />
        <View
          style={[styles.led, ledOn ? { backgroundColor: colors.led, boxShadow: `0 0 8px ${colors.led}` } : null]}
        />
      </View>
      <Text style={[styles.label, { color: lit ? colors.ink : colors.text }]} numberOfLines={1}>
        {padTitle(pad)}
      </Text>
      <View style={styles.bottomRow}>
        <Text style={[styles.file, { color: lit ? colors.inkMuted : colors.textMuted }]} numberOfLines={1}>
          {pad.sample.fileName}
        </Text>
        <Text
          style={[
            styles.time,
            { color: lit ? colors.ink : colors.text },
            status && { fontSize: 11, color: status.kind === 'error' ? colors.danger : colors.textMuted },
          ]}
        >
          {time}
        </Text>
      </View>
      {(playing || fading) && (
        <View style={[styles.track, lit && { backgroundColor: 'rgba(23,19,15,0.18)' }]}>
          <View
            style={[
              styles.bar,
              { width: `${pct}%`, backgroundColor: lit ? colors.ink : color },
              pad.reverse ? { right: 0 } : { left: 0 },
            ]}
          />
        </View>
      )}
      {hint && (
        <View style={styles.hint}>
          <Text style={styles.hintText}>HOLD TO STOP</Text>
        </View>
      )}
      {hold !== null && (
        <View style={styles.holdOverlay}>
          <Text style={styles.holdText}>■ STOP</Text>
          <View style={styles.holdTrack}>
            <View style={[styles.holdFill, { width: `${Math.min(1, hold) * 100}%` }]} />
          </View>
        </View>
      )}
      {editing && <View style={styles.editVeil} />}
    </View>
  );
}

export const PadView = memo(PadViewImpl);

const styles = StyleSheet.create({
  pad: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 10,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  restShadow: { boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.35)' },
  empty: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line },
  emptyEditing: { borderColor: colors.edit },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  num: { fontFamily: fonts.monoBold, fontSize: 11 },
  swatch: { width: 8, height: 8, borderRadius: 2, opacity: 0.6 },
  badge: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    letterSpacing: 0.5,
    paddingHorizontal: 5,
    borderWidth: 1,
    borderColor: 'currentColor',
    borderRadius: 3,
    opacity: 0.85,
  },
  led: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ledOff },
  label: { fontFamily: fonts.label, fontSize: 27, lineHeight: 30, letterSpacing: 0.8 },
  emptyLabel: { fontSize: 20, letterSpacing: 3, color: colors.textDisabled },
  bottomRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  file: { flex: 1, fontFamily: fonts.mono, fontSize: 10 },
  time: { fontFamily: fonts.monoBold, fontSize: 15, fontVariant: ['tabular-nums'] },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4 },
  bar: { position: 'absolute', top: 0, bottom: 0 },
  hint: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: '38%',
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(23,19,15,0.9)',
  },
  hintText: { color: colors.text, fontFamily: fonts.monoBold, fontSize: 10, textAlign: 'center', letterSpacing: 0.5 },
  holdOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(23,19,15,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  holdText: { color: colors.text, fontFamily: fonts.monoBold, fontSize: 12, letterSpacing: 2 },
  holdTrack: { width: '60%', height: 4, backgroundColor: colors.line },
  holdFill: { height: 4, backgroundColor: colors.danger },
  editVeil: { ...StyleSheet.absoluteFill, borderRadius: 4, borderWidth: 1, borderColor: colors.edit },
});
