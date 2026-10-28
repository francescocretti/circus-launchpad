// Finestra SYNC (spec §10.2), aperta da EDIT con `⟳ SYNC`: account Google, ultima sync e SYNC NOW.
// L'interruttore MOBILE DATA arriva con il passo 4 (§15.7).
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';
import { SyncIcon } from './SyncIcon';
import { ROOT_FOLDER_NAME } from './drive';
import type { SyncProgress } from './run';
import type { SyncState } from './useSync';

const progressText = (p: SyncProgress) =>
  p.phase === 'sets' ? `Sets ${p.done}/${p.total}` : `Samples ${p.done}/${p.total}`;

function formatLastSync(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const time = d.toTimeString().slice(0, 5);
  return d.toDateString() === new Date().toDateString() ? time : `${d.toISOString().slice(0, 10)} ${time}`;
}

export function SyncSheet({ visible, sync, onClose }: { visible: boolean; sync: SyncState; onClose: () => void }) {
  const { account, busy, error, progress } = sync;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={['landscape']}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>SYNC</Text>
            <SyncIcon busy={busy} error={!!error} size={20} />
            <View style={{ flex: 1 }} />
            <Pressable onPress={onClose} style={styles.btn}>
              <Text style={styles.btnText}>CLOSE</Text>
            </Pressable>
          </View>
          <Text style={styles.detail}>
            Back up your sets and keep them the same on all your phones, in the “{ROOT_FOLDER_NAME}” folder of your
            Google Drive. The app can only see the files it creates.
          </Text>
          <View style={styles.row}>
            <Text style={styles.label}>ACCOUNT</Text>
            <Text style={styles.value} numberOfLines={1}>
              {account ? account.email : 'Not signed in'}
            </Text>
            <Pressable
              onPress={account ? sync.signOut : sync.signIn}
              disabled={busy}
              style={[styles.btn, !account && styles.primary, busy && { opacity: 0.35 }]}
            >
              <Text style={[styles.btnText, !account && { color: colors.ink }]}>{account ? 'SIGN OUT' : 'SIGN IN'}</Text>
            </Pressable>
          </View>
          {account && (
            <View style={styles.row}>
              <Text style={styles.label}>LAST SYNC</Text>
              <Text style={styles.value} numberOfLines={1}>
                {busy && progress ? progressText(progress) : busy ? 'Syncing…' : formatLastSync(sync.lastSync)}
              </Text>
              <Pressable onPress={sync.syncNow} disabled={busy} style={[styles.btn, busy && { opacity: 0.35 }]}>
                <Text style={styles.btnText}>SYNC NOW</Text>
              </Pressable>
            </View>
          )}
          {error && <Text style={[styles.detail, { color: colors.danger }]}>{error}</Text>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  sheet: {
    width: 640,
    maxWidth: '94%',
    maxHeight: '94%',
    backgroundColor: colors.chassis,
    borderWidth: 2,
    borderColor: colors.edit,
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: fonts.label, fontSize: 22, letterSpacing: 2, color: colors.text },
  detail: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
  },
  label: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1, color: colors.textMuted },
  value: { flex: 1, fontFamily: fonts.monoMedium, fontSize: 13, color: colors.text },
  btn: { borderWidth: 1, borderColor: '#5a534c', borderRadius: 4, paddingHorizontal: 14, height: 36, justifyContent: 'center' },
  primary: { backgroundColor: colors.text, borderColor: colors.text },
  btnText: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1, color: colors.text },
});
