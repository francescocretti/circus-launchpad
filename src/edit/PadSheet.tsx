// Finestra del pad in modalità EDIT (spec §7.2, D-29): si apre toccando un pad e contiene tutte le sue
// impostazioni. Ogni modifica si salva subito; CONFIRM chiude soltanto.
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { appliedGainDb, normalization, TRIM_MAX_DB, TRIM_MIN_DB } from '../audio/gain';
import { PadConfig, PadMode, Retrigger } from '../model/pads';
import { engine, PadStatus } from '../model/usePadSet';
import { colors, fonts, PAD_COLORS } from '../theme';
import { Slider } from './Slider';

const LONG_FILE_SEC = 5 * 60; // spec §8: avviso oltre 5 minuti per file
const SET_MEMORY_WARN_MB = 300; // spec §8: avviso oltre 300 MB decodificati per set
const MAX_LABEL = 16;
// Durate di fade predefinite (D-30): un tocco, niente regolazioni fini. 0 si legge OFF (resta solo la micro-rampa
// anti-click di spec §5.2).
const FADE_OPTIONS: [number, string][] = [[0, 'OFF'], [1, '1 s'], [3, '3 s'], [5, '5 s'], [7, '7 s']];

interface Props {
  pad: PadConfig | null;
  status?: PadStatus;
  setMemoryMB: number;
  onClose: () => void;
  onLoad: (slot: number, uri: string, name: string) => void;
  onUpdate: (slot: number, patch: Partial<PadConfig>) => void;
  onClear: (slot: number) => void;
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtNum = (x: number, digits = 1) => x.toFixed(digits).replace('-', '−');
const fmtDb = (x: number) => (x > 0 ? '+' : x === 0 ? '±' : '') + fmtNum(x) + ' dB';

function Segment<T extends string | number | boolean>(props: {
  title: string;
  value: T;
  options: [T, string][];
  onPick: (v: T) => void;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{props.title}</Text>
      <View style={styles.segment}>
        {props.options.map(([v, label]) => {
          const on = v === props.value;
          return (
            <Pressable
              key={String(v)}
              onPress={() => props.onPick(v)}
              style={[styles.segBtn, on && styles.segOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.segText, on && { color: colors.ink }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Button(props: { label: string; onPress: () => void; variant?: 'primary' | 'confirm' | 'danger'; disabled?: boolean }) {
  const v = props.variant;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[
        styles.btn,
        v === 'primary' && styles.btnPrimary,
        v === 'confirm' && styles.btnConfirm,
        v === 'danger' && styles.btnDanger,
        props.disabled && { opacity: 0.4 },
      ]}
    >
      <Text
        style={[
          styles.btnText,
          v === 'primary' && { color: colors.ink },
          v === 'confirm' && { color: colors.edit },
          v === 'danger' && { color: colors.danger },
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

const subscribe = (cb: () => void) => {
  const off = engine.subscribe(cb);
  return () => {
    off();
  };
};

export function PadSheet({ pad, status, setMemoryMB, onClose, onLoad, onUpdate, onClear }: Props) {
  const slot = pad?.slot ?? 0;
  const phase = useSyncExternalStore(subscribe, () => (slot ? engine.snapshot(slot).phase : 'idle'));
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(t);
  }, [confirmClear]);

  if (!pad) return null;

  const close = () => {
    // PREVIEW non deve continuare dopo la chiusura.
    if (phase === 'playing') engine.stop(slot, { fast: true });
    setConfirmClear(false);
    onClose();
  };
  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (res.canceled) return;
    onLoad(slot, res.assets[0].uri, res.assets[0].name);
  };
  const set = (patch: Partial<PadConfig>) => onUpdate(slot, patch);
  const busy = status?.kind === 'busy';
  const s = pad.sample;
  const ready = !!s && engine.isLoaded(slot) && !status;

  let volume = null;
  if (s) {
    const norm = normalization(s.loudnessLufs, s.truePeakDbtp);
    const total = appliedGainDb(norm, pad.normalize, pad.trimDb);
    volume = (
      <View style={styles.volume}>
        <View style={styles.volumeRow}>
          <Text style={styles.groupTitle}>VOLUME</Text>
          <Text style={styles.data}>
            LOUDNESS <Text style={styles.dataStrong}>{isFinite(s.loudnessLufs) ? `${fmtNum(s.loudnessLufs)} LUFS` : '—'}</Text>
          </Text>
          <Text style={styles.data}>
            NORM. <Text style={styles.dataStrong}>{pad.normalize ? fmtDb(norm.gainDb) : 'off'}</Text>
          </Text>
          {pad.normalize && norm.limited && (
            <Text style={[styles.data, { color: colors.edit }]}>peak-limited ({fmtDb(norm.gainDb - norm.wantedDb)})</Text>
          )}
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => set({ normalize: !pad.normalize })}
            style={styles.switchRow}
            accessibilityRole="switch"
            accessibilityState={{ checked: pad.normalize }}
          >
            <Text style={styles.segText}>NORMALIZE</Text>
            <View style={[styles.switch, pad.normalize && styles.switchOn]}>
              <View style={styles.switchKnob} />
            </View>
          </Pressable>
        </View>
        <View style={styles.volumeRow}>
          <Text style={[styles.groupTitle, { width: 86 }]}>TRIM</Text>
          <View style={{ flex: 1 }}>
            <Slider
              value={pad.trimDb}
              min={TRIM_MIN_DB}
              max={TRIM_MAX_DB}
              step={0.5}
              onChange={(trimDb) => set({ trimDb })}
              accessibilityLabel="Volume trim"
            />
          </View>
          <Text style={[styles.dataStrong, { width: 72, textAlign: 'right' }]}>{fmtDb(pad.trimDb)}</Text>
        </View>
        <Text style={styles.note}>
          Target −18 LUFS · ceiling −1 dBTP · total applied <Text style={styles.dataStrong}>{fmtDb(total)}</Text>
        </Text>
      </View>
    );
  }

  const warnings: string[] = [];
  if (s && s.durationSec > LONG_FILE_SEC) warnings.push('Long file (over 5 min): uses a lot of memory.');
  if (setMemoryMB > SET_MEMORY_WARN_MB) warnings.push(`This set uses ${Math.round(setMemoryMB)} MB of memory: over ${SET_MEMORY_WARN_MB} MB.`);

  return (
    <Modal transparent animationType="fade" onRequestClose={close} supportedOrientations={['landscape']}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <View style={[styles.swatch, { backgroundColor: PAD_COLORS[slot - 1] }]} />
              <Text style={styles.title}>PAD {String(slot).padStart(2, '0')}</Text>
              {s ? (
                <TextInput
                  value={pad.label}
                  onChangeText={(t) => set({ label: t.toUpperCase().slice(0, MAX_LABEL) })}
                  placeholder={s.fileName.toUpperCase()}
                  placeholderTextColor={colors.textDisabled}
                  maxLength={MAX_LABEL}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  accessibilityLabel="Pad label"
                  style={styles.labelInput}
                />
              ) : (
                <View style={{ flex: 1 }} />
              )}
              <Button label={s ? 'REPLACE' : 'LOAD'} variant="primary" onPress={pick} disabled={busy} />
              {s && (
                <Button
                  label={phase === 'playing' ? '■ STOP' : '▶ PREVIEW'}
                  disabled={!ready}
                  onPress={() => (phase === 'playing' ? engine.stop(slot) : engine.start(slot))}
                />
              )}
              {s && (
                <Button
                  label={confirmClear ? 'SURE?' : 'CLEAR'}
                  variant={confirmClear ? 'danger' : undefined}
                  onPress={() => {
                    if (!confirmClear) return setConfirmClear(true);
                    onClear(slot);
                    setConfirmClear(false);
                  }}
                />
              )}
              <Button label="CONFIRM" variant="confirm" onPress={close} />
            </View>

            {status ? (
              <Text style={[styles.data, status.kind === 'error' && { color: colors.danger }]}>
                {status.message}
                {status.kind === 'error' && s ? ` · ${s.fileName}` : ''}
              </Text>
            ) : s ? (
              <Text style={styles.data} numberOfLines={1}>
                {s.fileName} · {fmtTime(s.durationSec)} · {fmtNum(s.sampleRate / 1000)} kHz · {s.channels === 1 ? 'mono' : 'stereo'}
              </Text>
            ) : (
              <Text style={styles.data}>Empty pad: LOAD to pick a file (WAV, MP3, M4A, FLAC, OGG).</Text>
            )}
            {warnings.map((w) => (
              <Text key={w} style={[styles.data, { color: colors.edit }]}>⚠ {w}</Text>
            ))}

            {s && (
              <>
                <View style={styles.row}>
                  <Segment<PadMode> title="MODE" value={pad.mode} options={[['oneshot', 'ONE SHOT'], ['loop', 'LOOP']]} onPick={(mode) => set({ mode })} />
                  <Segment<boolean> title="DIRECTION" value={pad.reverse} options={[[false, 'FWD ▸'], [true, '◂ REV']]} onPick={(reverse) => set({ reverse })} />
                  <Segment<Retrigger> title="ON RETRIGGER" value={pad.retrigger} options={[['stop', 'STOP'], ['restart', 'RESTART'], ['ignore', 'IGNORE']]} onPick={(retrigger) => set({ retrigger })} />
                </View>
                <View style={styles.row}>
                  <Segment<number> title="FADE IN" value={pad.fadeInSec} options={FADE_OPTIONS} onPick={(fadeInSec) => set({ fadeInSec })} />
                  <Segment<number> title="FADE OUT" value={pad.fadeOutSec} options={FADE_OPTIONS} onPick={(fadeOutSec) => set({ fadeOutSec })} />
                </View>
                {volume}
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  sheet: {
    width: 800,
    maxWidth: '94%',
    maxHeight: '94%',
    backgroundColor: colors.chassis,
    borderWidth: 2,
    borderColor: colors.edit,
    borderRadius: 8,
    padding: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 12, height: 26, borderRadius: 3 },
  title: { fontFamily: fonts.label, fontSize: 22, letterSpacing: 1, color: colors.text, marginRight: 4 },
  labelInput: {
    flex: 1,
    minWidth: 0,
    height: 36,
    paddingHorizontal: 10,
    paddingVertical: 0,
    fontFamily: fonts.label,
    fontSize: 22,
    letterSpacing: 0.6,
    color: colors.text,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 4,
  },
  row: { flexDirection: 'row', gap: 12 },
  group: { flex: 1, gap: 5 },
  groupTitle: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, color: colors.textMuted },
  segment: { flexDirection: 'row', borderWidth: 1, borderColor: colors.line, borderRadius: 4, overflow: 'hidden' },
  segBtn: { flex: 1, height: 34, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.text },
  segText: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.textMuted, letterSpacing: 0.5 },
  btn: { borderWidth: 1, borderColor: '#5a534c', borderRadius: 4, paddingHorizontal: 12, height: 36, justifyContent: 'center' },
  btnPrimary: { backgroundColor: colors.text, borderColor: colors.text },
  btnConfirm: { borderColor: colors.edit, paddingHorizontal: 16 },
  btnDanger: { borderColor: colors.danger },
  btnText: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1, color: colors.text },
  data: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },
  dataStrong: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.text },
  note: { fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted },
  volume: { borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 10, gap: 6, backgroundColor: '#181614' },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  switch: { width: 30, height: 16, borderRadius: 8, padding: 2, backgroundColor: '#5a534c', alignItems: 'flex-start' },
  switchOn: { backgroundColor: colors.edit, alignItems: 'flex-end' },
  switchKnob: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.text },
});
