// Circus Launchpad: una sola schermata con due modalità, PLAY ed EDIT (spec §4, §7).
import { BarlowCondensed_500Medium, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';
import { useFonts } from 'expo-font';
import { useKeepAwake } from 'expo-keep-awake';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { ChecklistSheet } from './src/edit/ChecklistSheet';
import { PadSheet } from './src/edit/PadSheet';
import { SetSheet } from './src/edit/SetSheet';
import { tap } from './src/haptics';
import { engine, usePadSet } from './src/model/usePadSet';
import { PadGrid } from './src/play/PadGrid';
import { TopBar } from './src/play/TopBar';
import { currentAccount } from './src/sync/auth';
import { SyncSheet } from './src/sync/SyncSheet';
import { useSync } from './src/sync/useSync';
import { useAudioOutput } from './src/play/useAudioOutput';
import { colors } from './src/theme';

/** All'apertura il set attivo si aggiorna dalla sync solo entro questo tempo e prima di suonare (spec §10.2). */
const STARTUP_APPLY_MS = 5000;
const NOTICE_MS = 3000;

export default function App() {
  useKeepAwake();
  const [fontsLoaded] = useFonts({
    BarlowCondensed_500Medium,
    BarlowCondensed_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });
  const pads = usePadSet({ samplesMayArrive: currentAccount() !== null });
  const { set, statuses, startup, haptics, setHaptics, update, load, clear } = pads;
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [setsOpen, setSetsOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [setsVersion, setSetsVersion] = useState(0);
  const editingRef = useRef(editing);
  const activeId = useRef(set?.id);
  const launchedAt = useRef(Date.now());
  const played = useRef(false);
  useEffect(() => {
    editingRef.current = editing;
    activeId.current = set?.id;
  });

  // La sync sostituisce il set attivo solo in EDIT, oppure appena aperta l'app prima di suonare (spec §10.2).
  const canReplace = useCallback(
    (id: string) =>
      id !== activeId.current ||
      editingRef.current ||
      (!played.current && Date.now() - launchedAt.current < STARTUP_APPLY_MS),
    [],
  );
  const sync = useSync({
    canReplace,
    beforeSync: () => {
      pads.flush();
      pads.setSamplesPending(true);
    },
    onSample: () => void pads.resolveWaiting(),
    onDone: (r) => {
      pads.setSamplesPending(false);
      if (r) {
        if (pads.applySync(r.changed, r.deleted)) setNotice('SET UPDATED');
        if (r.changed.length || r.deleted.length) setSetsVersion((v) => v + 1);
      }
      void pads.resolveWaiting();
    },
  });
  const { request: requestSync, deferred: syncDeferred } = sync;

  // Sync all'apertura.
  useEffect(() => {
    requestSync();
  }, [requestSync]);

  // Entrando in EDIT, se la sync aveva lasciato in sospeso il set attivo, si riprova (adesso si può sostituire).
  useEffect(() => {
    if (editing && syncDeferred) requestSync();
  }, [editing, syncDeferred, requestSync]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);
  const [activeCount, setActiveCount] = useState(0);
  const { output, changed: outputChanged } = useAudioOutput();

  useEffect(
    () =>
      engine.subscribe(() => {
        const n = engine.activeCount();
        if (n > 0) played.current = true;
        setActiveCount(n);
      }),
    [],
  );

  // In PLAY il tasto Indietro non fa nulla; in EDIT riporta a PLAY (spec §12).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (editing) {
        setEditing(false);
        requestSync();
      }
      return true;
    });
    return () => sub.remove();
  }, [editing, requestSync]);

  // Memoria occupata dai sample decodificati (float32), raddoppiata per i pad in reverse (spec §8).
  const setMemoryMB = useMemo(
    () =>
      (set?.pads ?? []).reduce((mb, p) => {
        const s = p.sample;
        return s ? mb + (s.durationSec * s.sampleRate * s.channels * 4 * (p.reverse ? 2 : 1)) / 1e6 : mb;
      }, 0),
    [set],
  );

  if (!fontsLoaded || !set) return <View style={styles.root} />;

  return (
    <View style={[styles.root, editing && styles.editing]}>
      <StatusBar hidden />
      <NavigationBar hidden />
      <TopBar
        editing={editing}
        setName={set.name}
        activeCount={activeCount}
        startup={startup}
        haptics={haptics}
        output={output}
        outputChanged={outputChanged}
        onToggleHaptics={() => setHaptics(!haptics)}
        onEdit={() => setEditing(true)}
        onOpenSets={() => setSetsOpen(true)}
        onOpenChecklist={() => setChecklistOpen(true)}
        onOpenSync={() => setSyncOpen(true)}
        syncBusy={sync.busy}
        syncError={!!sync.error}
        notice={notice}
        onDone={() => {
          setEditing(false);
          requestSync();
        }}
        onStopAll={() => {
          engine.stopAll();
          tap(haptics);
        }}
      />
      <PadGrid pads={set.pads} editing={editing} haptics={haptics} statuses={statuses} onSelect={setSelected} />
      <PadSheet
        pad={selected === null ? null : set.pads[selected - 1]}
        status={selected === null ? undefined : statuses[selected]}
        setMemoryMB={setMemoryMB}
        onClose={() => setSelected(null)}
        onLoad={load}
        onUpdate={update}
        onClear={clear}
      />
      <SetSheet
        visible={setsOpen}
        active={set}
        listSets={pads.sets}
        onClose={() => setSetsOpen(false)}
        onSwitch={pads.switchSet}
        onCreate={pads.createSet}
        onRename={pads.renameSet}
        onDuplicate={pads.duplicateSet}
        onDelete={pads.deleteSet}
        onExport={pads.exportActive}
        onImport={pads.importFile}
        refreshKey={setsVersion}
      />
      <ChecklistSheet visible={checklistOpen} onClose={() => setChecklistOpen(false)} />
      <SyncSheet visible={syncOpen} sync={sync} onClose={() => setSyncOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.chassis },
  editing: { borderWidth: 2, borderColor: colors.edit },
});
