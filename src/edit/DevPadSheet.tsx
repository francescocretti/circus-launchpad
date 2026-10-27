// PANNELLO PROVVISORIO di M2: serve solo a caricare e impostare i pad per provare PLAY sul telefono.
// Il pannello EDIT vero (spec §7.2) arriva in M3 e sostituisce questo file.
import * as DocumentPicker from 'expo-document-picker';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { PadConfig, PadMode, Retrigger } from '../model/pads';
import { colors, fonts, PAD_COLORS } from '../theme';

interface Props {
  pad: PadConfig | null;
  onClose: () => void;
  onLoad: (slot: number, uri: string, name: string) => void;
  onUpdate: (slot: number, patch: Partial<PadConfig>) => void;
  onClear: (slot: number) => void;
}

function Segment<T extends string | boolean>({
  title,
  value,
  options,
  onPick,
}: {
  title: string;
  value: T;
  options: [T, string][];
  onPick: (v: T) => void;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.segment}>
        {options.map(([v, label]) => (
          <Pressable key={String(v)} onPress={() => onPick(v)} style={[styles.segBtn, v === value && styles.segOn]}>
            <Text style={[styles.segText, v === value && { color: colors.ink }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function DevPadSheet({ pad, onClose, onLoad, onUpdate, onClear }: Props) {
  if (!pad) return null;
  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (res.canceled) return;
    onClose();
    onLoad(pad.slot, res.assets[0].uri, res.assets[0].name);
  };
  const set = (patch: Partial<PadConfig>) => onUpdate(pad.slot, patch);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} supportedOrientations={['landscape']}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <View style={[styles.swatch, { backgroundColor: PAD_COLORS[pad.slot - 1] }]} />
            <Text style={styles.title}>PAD {String(pad.slot).padStart(2, '0')}</Text>
            <Text style={styles.file} numberOfLines={1}>
              {pad.sample ? pad.sample.fileName : 'vuoto'}
            </Text>
            <Pressable onPress={pick} style={[styles.btn, styles.btnPrimary]}>
              <Text style={[styles.btnText, { color: colors.ink }]}>CARICA</Text>
            </Pressable>
            {pad.sample && (
              <Pressable onPress={() => { onClear(pad.slot); onClose(); }} style={styles.btn}>
                <Text style={styles.btnText}>SVUOTA</Text>
              </Pressable>
            )}
            <Pressable onPress={onClose} style={[styles.btn, styles.btnOk]}>
              <Text style={[styles.btnText, { color: colors.edit }]}>CONFERMA</Text>
            </Pressable>
          </View>
          {pad.sample && (
            <>
              <View style={styles.row}>
                <Segment<PadMode> title="MODALITÀ" value={pad.mode} options={[['oneshot', 'ONE SHOT'], ['loop', 'LOOP']]} onPick={(mode) => set({ mode })} />
                <Segment<boolean> title="DIREZIONE" value={pad.reverse} options={[[false, 'AVANTI'], [true, '◂ REV']]} onPick={(reverse) => set({ reverse })} />
                <Segment<Retrigger> title="AL RITOCCO" value={pad.retrigger} options={[['stop', 'STOP'], ['restart', 'RIPARTE'], ['ignore', 'IGNORA']]} onPick={(retrigger) => set({ retrigger })} />
              </View>
              <View style={styles.row}>
                <Segment<string> title="FADE OUT" value={String(pad.fadeOutSec)} options={[['0', '0 s'], ['1', '1 s'], ['3', '3 s'], ['6', '6 s']]} onPick={(v) => set({ fadeOutSec: Number(v) })} />
                <Segment<string> title="FADE IN" value={String(pad.fadeInSec)} options={[['0', '0 s'], ['1', '1 s'], ['3', '3 s']]} onPick={(v) => set({ fadeInSec: Number(v) })} />
                <View style={styles.group}>
                  <Text style={styles.groupTitle}>LOUDNESS</Text>
                  <Text style={styles.file}>
                    {pad.sample.loudnessLufs.toFixed(1)} LUFS · TP {pad.sample.truePeakDbtp.toFixed(1)} dBTP
                  </Text>
                </View>
              </View>
            </>
          )}
          <Text style={styles.note}>Pannello provvisorio per provare PLAY — l&apos;EDIT vero arriva con M3.</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  sheet: {
    width: 760,
    maxWidth: '92%',
    backgroundColor: colors.chassis,
    borderWidth: 2,
    borderColor: colors.edit,
    borderRadius: 8,
    padding: 16,
    gap: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 12, height: 24, borderRadius: 3 },
  title: { fontFamily: fonts.label, fontSize: 22, letterSpacing: 1, color: colors.text },
  file: { flex: 1, fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },
  row: { flexDirection: 'row', gap: 12 },
  group: { flex: 1, gap: 5 },
  groupTitle: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, color: colors.textMuted },
  segment: { flexDirection: 'row', borderWidth: 1, borderColor: colors.line, borderRadius: 4, overflow: 'hidden' },
  segBtn: { flex: 1, height: 34, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.text },
  segText: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.textMuted },
  btn: { borderWidth: 1, borderColor: '#5a534c', borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8 },
  btnPrimary: { backgroundColor: colors.text, borderColor: colors.text },
  btnOk: { borderColor: colors.edit, paddingHorizontal: 16 },
  btnText: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1, color: colors.text },
  note: { fontFamily: fonts.mono, fontSize: 10, color: colors.textDisabled },
});
