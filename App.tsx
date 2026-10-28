// Circus Launchpad: una sola schermata con due modalità, PLAY ed EDIT (spec §4, §7).
import { BarlowCondensed_500Medium, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';
import { useFonts } from 'expo-font';
import { useKeepAwake } from 'expo-keep-awake';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { ChecklistSheet } from './src/edit/ChecklistSheet';
import { PadSheet } from './src/edit/PadSheet';
import { SetSheet } from './src/edit/SetSheet';
import { tap } from './src/haptics';
import { engine, usePadSet } from './src/model/usePadSet';
import { PadGrid } from './src/play/PadGrid';
import { TopBar } from './src/play/TopBar';
import { SyncSheet } from './src/sync/SyncSheet';
import { useSync } from './src/sync/useSync';
import { useAudioOutput } from './src/play/useAudioOutput';
import { colors } from './src/theme';

export default function App() {
  useKeepAwake();
  const [fontsLoaded] = useFonts({
    BarlowCondensed_500Medium,
    BarlowCondensed_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });
  const pads = usePadSet();
  const { set, statuses, startup, haptics, setHaptics, update, load, clear } = pads;
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [setsOpen, setSetsOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  // Per ora la sync non tocca il set attivo: il ricaricamento dei pad arriva con il passo 4 (spec §15.7).
  const sync = useSync((id) => id !== set?.id);
  const [activeCount, setActiveCount] = useState(0);
  const { output, changed: outputChanged } = useAudioOutput();

  useEffect(() => engine.subscribe(() => setActiveCount(engine.activeCount())), []);

  // In PLAY il tasto Indietro non fa nulla; in EDIT riporta a PLAY (spec §12).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (editing) setEditing(false);
      return true;
    });
    return () => sub.remove();
  }, [editing]);

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
        onDone={() => setEditing(false)}
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
