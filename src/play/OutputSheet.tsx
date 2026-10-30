// Spiegazione delle uscite audio (spec §11): si apre toccando l'indicatore nella barra, in PLAY e in EDIT.
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AudioOutput, OutputKind } from '../../modules/audio-output/src';
import { colors, fonts } from '../theme';
import { OUTPUT_COLOR, OUTPUT_LABEL } from './TopBar';

// Dalla migliore alla peggiore per il palco; la latenza del Bluetooth è quella di spec §11.
const ROWS: { kind: OutputKind; name: string; what: string; latency: string; verdict: string }[] = [
  { kind: 'usb', name: 'USB-C', what: 'USB-C audio interface or adapter', latency: 'very low latency', verdict: '✓ best for the stage' },
  { kind: 'wired', name: 'WIRED', what: 'headphone jack or line out', latency: 'very low latency', verdict: '✓ stage' },
  { kind: 'speaker', name: 'SPEAKER', what: "the phone's own speaker", latency: 'low latency', verdict: 'soundcheck only' },
  { kind: 'bluetooth', name: 'BLUETOOTH', what: 'headphones, speakers', latency: '150–300 ms delay', verdict: '✗ never live' },
];

export function OutputSheet({ visible, output, onClose }: { visible: boolean; output: AudioOutput; onClose: () => void }) {
  const listed = ROWS.some((r) => r.kind === output.kind);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={['landscape']}>
      <View style={styles.backdrop}>
        {/* Sfondo dietro la finestra, non attorno: un Pressable attorno a uno ScrollView ne ruba i trascinamenti. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>AUDIO OUTPUT</Text>
            <View style={{ flex: 1 }} />
            <Pressable onPress={onClose} style={styles.btn}>
              <Text style={styles.btnText}>CLOSE</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 6 }}>
            {!listed && (
              <Text style={styles.detail}>
                Now: {OUTPUT_LABEL[output.kind]}
                {output.name ? ` · ${output.name}` : ''}
              </Text>
            )}
            {ROWS.map((r) => {
              const now = r.kind === output.kind;
              const color = OUTPUT_COLOR[r.kind];
              return (
                <View key={r.kind} style={[styles.row, now && { borderColor: color, backgroundColor: colors.panel }]}>
                  <View style={styles.line}>
                    <View style={[styles.dot, { backgroundColor: color }]} />
                    <Text style={[styles.name, { color: now ? color : colors.text }]}>{r.name}</Text>
                    <Text style={[styles.detail, { flex: 1 }]}>{r.what}</Text>
                    <Text style={[styles.detail, styles.latency]}>{r.latency}</Text>
                    <Text style={[styles.verdict, { color }]}>{r.verdict}</Text>
                  </View>
                  {now && (
                    <Text style={[styles.now, { color }]}>
                      ← NOW{output.name ? ` · ${output.name}` : ''}
                    </Text>
                  )}
                </View>
              );
            })}
            <Text style={[styles.detail, { marginTop: 4 }]}>
              Android picks the output, not the app: plug in a cable and the sound moves there.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  sheet: {
    width: 760,
    maxWidth: '94%',
    maxHeight: '94%',
    backgroundColor: colors.chassis,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { fontFamily: fonts.label, fontSize: 22, letterSpacing: 2, color: colors.text },
  row: { borderWidth: 1, borderColor: 'transparent', borderRadius: 4, paddingHorizontal: 10, paddingVertical: 7, gap: 3 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  name: { width: 86, fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1.3 },
  latency: { width: 120 },
  verdict: { width: 150, fontFamily: fonts.monoBold, fontSize: 11 },
  now: { marginLeft: 17, fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 1 },
  detail: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },
  btn: { borderWidth: 1, borderColor: colors.line, borderRadius: 4, paddingHorizontal: 14, height: 36, justifyContent: 'center' },
  btnText: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1, color: colors.text },
});
