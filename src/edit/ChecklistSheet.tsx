// Checklist da palco (spec §12): promemoria da scorrere prima del concerto, aperto da EDIT.
import * as Application from 'expo-application';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

const ITEMS: [string, string][] = [
  ['Airplane mode and Do Not Disturb', 'No calls, notifications or system vibrations during the show.'],
  ['Battery', 'Fully charged, or plugged in (a USB-C adapter with pass-through charging keeps the output free).'],
  ['System volume at maximum', 'Set the level at the mixer, not on the phone.'],
  ['Wired output', 'The bar must show ● USB-C or ● WIRED in green. Never Bluetooth: too much latency.'],
  ['App pinning', 'Settings → Security → App pinning: keeps you from leaving the app by mistake.'],
  ['Right set', 'Check the set name in the bar.'],
  ['Test every pad', 'At soundcheck, each pad once, with the engineer at the mixer.'],
];

// Versione dell'APK installato (versionName · versionCode), per sapere che build ha chi chiede aiuto.
const VERSION = `Circus Launchpad v${Application.nativeApplicationVersion} (${Application.nativeBuildVersion})`;

export function ChecklistSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={['landscape']}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>STAGE CHECKLIST</Text>
            <View style={{ flex: 1 }} />
            <Pressable onPress={onClose} style={styles.btn}>
              <Text style={styles.btnText}>CLOSE</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            {ITEMS.map(([title, detail], i) => (
              <View key={title} style={styles.item}>
                <Text style={styles.num}>{i + 1}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.itemTitle}>{title.toUpperCase()}</Text>
                  <Text style={styles.detail}>{detail}</Text>
                </View>
              </View>
            ))}
            <Text style={styles.version}>{VERSION}</Text>
          </ScrollView>
        </Pressable>
      </Pressable>
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
    borderColor: colors.edit,
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { fontFamily: fonts.label, fontSize: 22, letterSpacing: 2, color: colors.text },
  item: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  num: { width: 22, fontFamily: fonts.monoBold, fontSize: 14, color: colors.edit },
  itemTitle: { fontFamily: fonts.label, fontSize: 17, letterSpacing: 0.8, color: colors.text },
  detail: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },
  version: { fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted, textAlign: 'right', marginTop: 4 },
  btn: { borderWidth: 1, borderColor: colors.edit, borderRadius: 4, paddingHorizontal: 14, height: 36, justifyContent: 'center' },
  btnText: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1, color: colors.edit },
});
