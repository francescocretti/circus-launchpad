// Finestra SET (spec §10, M4): elenco dei set, cambio del set attivo, rinomina, duplica, esporta, elimina,
// nuovo set, importazione da file .circus. Si apre in EDIT toccando il nome del set nella barra.
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { decodedMB } from '../model/pads';
import { MAX_SET_NAME } from '../model/usePadSet';
import type { PadSet } from '../model/storage';
import { colors, fonts } from '../theme';

interface Props {
  visible: boolean;
  active: PadSet;
  listSets: () => PadSet[];
  onClose: () => void;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => Promise<void>;
  onImport: (uri: string) => void;
  /** Cambia quando la sync modifica l'elenco dei set: la finestra lo rilegge. */
  refreshKey: number;
}

const stats = (set: PadSet) => {
  const loaded = set.pads.filter((p) => p.sample);
  const mb = decodedMB(set.pads);
  return `${loaded.length} ${loaded.length === 1 ? 'pad' : 'pads'} · ${Math.round(mb)} MB`;
};

/** Esegue un'operazione lunga e sincrona dopo aver lasciato disegnare il messaggio di attesa. */
const afterPaint = () => new Promise((r) => setTimeout(r, 50));

function Btn(props: { label: string; onPress: () => void; tone?: 'confirm' | 'danger' | 'primary'; disabled?: boolean }) {
  const t = props.tone;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[
        styles.btn,
        t === 'primary' && { backgroundColor: colors.text, borderColor: colors.text },
        t === 'confirm' && { borderColor: colors.edit },
        t === 'danger' && { borderColor: colors.danger },
        props.disabled && { opacity: 0.35 },
      ]}
    >
      <Text
        style={[
          styles.btnText,
          t === 'primary' && { color: colors.ink },
          t === 'confirm' && { color: colors.edit },
          t === 'danger' && { color: colors.danger },
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

export function SetSheet(props: Props) {
  const { visible, active, listSets, refreshKey } = props;
  const [list, setList] = useState<PadSet[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Rilegge l'elenco all'apertura e quando cambia il set attivo (nome, cambio, creazione…).
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setList(listSets()), 0);
    return () => clearTimeout(t);
  }, [visible, active, listSets, refreshKey]);

  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  const run = async (message: string, action: () => unknown) => {
    setError(null);
    setBusy(message);
    await afterPaint();
    try {
      await action();
      setList(listSets());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const importFromFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (res.canceled) return;
    run('IMPORTING…', () => props.onImport(res.assets[0].uri));
  };

  const close = () => {
    setConfirmDelete(false);
    setError(null);
    props.onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} supportedOrientations={['landscape']}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>SET</Text>
            <Text style={styles.hint}>Tap a set to make it active. Actions apply to the active set.</Text>
            <View style={{ flex: 1 }} />
            <Btn label="CLOSE" tone="confirm" onPress={close} disabled={!!busy} />
          </View>

          <ScrollView style={styles.list} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
            {list.map((s) => {
              const isActive = s.id === active.id;
              const shown = isActive ? active : s;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => !isActive && !busy && props.onSwitch(s.id)}
                  style={[styles.row, isActive && styles.rowActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <View style={[styles.dot, isActive && styles.dotActive]} />
                  {isActive ? (
                    <TextInput
                      value={active.name}
                      onChangeText={props.onRename}
                      maxLength={MAX_SET_NAME}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      accessibilityLabel="Set name"
                      style={styles.nameInput}
                    />
                  ) : (
                    <Text style={styles.name} numberOfLines={1}>{s.name}</Text>
                  )}
                  <Text style={styles.stats}>{stats(shown)}</Text>
                  {isActive && (
                    <View style={styles.actions}>
                      <Btn label="DUPLICATE" onPress={() => run('DUPLICATING…', props.onDuplicate)} disabled={!!busy} />
                      <Btn label="EXPORT" onPress={() => run('EXPORTING…', props.onExport)} disabled={!!busy} />
                      <Btn
                        label={confirmDelete ? 'SURE?' : 'DELETE'}
                        tone={confirmDelete ? 'danger' : undefined}
                        disabled={!!busy || list.length < 2}
                        onPress={() => {
                          if (!confirmDelete) return setConfirmDelete(true);
                          setConfirmDelete(false);
                          run('DELETING…', props.onDelete);
                        }}
                      />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <Btn label="+ NEW SET" tone="primary" onPress={() => run('CREATING…', props.onCreate)} disabled={!!busy} />
            <Btn label="IMPORT FROM FILE…" onPress={importFromFile} disabled={!!busy} />
            <View style={{ flex: 1 }} />
            {busy && <Text style={[styles.hint, { color: colors.edit }]}>{busy}</Text>}
            {error && <Text style={[styles.hint, { color: colors.danger }]} numberOfLines={2}>ERROR: {error}</Text>}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  sheet: {
    width: 860,
    maxWidth: '94%',
    maxHeight: '94%',
    backgroundColor: colors.chassis,
    borderWidth: 2,
    borderColor: colors.edit,
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { fontFamily: fonts.label, fontSize: 22, letterSpacing: 2, color: colors.text },
  hint: { fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted, flexShrink: 1 },
  list: { maxHeight: 210 },
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
  rowActive: { borderColor: colors.edit, backgroundColor: '#181614' },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.textMuted },
  dotActive: { backgroundColor: colors.edit, borderColor: colors.edit },
  name: { flex: 1, fontFamily: fonts.label, fontSize: 20, letterSpacing: 0.8, color: colors.text },
  nameInput: {
    flex: 1,
    minWidth: 0,
    height: 36,
    paddingHorizontal: 8,
    paddingVertical: 0,
    fontFamily: fonts.label,
    fontSize: 20,
    letterSpacing: 0.8,
    color: colors.text,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 4,
  },
  stats: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: 6 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { borderWidth: 1, borderColor: '#5a534c', borderRadius: 4, paddingHorizontal: 12, height: 36, justifyContent: 'center' },
  btnText: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1, color: colors.text },
});
