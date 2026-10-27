// Circus Launchpad: una sola schermata con due modalità, PLAY ed EDIT (spec §4, §7).
import { BarlowCondensed_500Medium, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';
import { useFonts } from 'expo-font';
import { useKeepAwake } from 'expo-keep-awake';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { DevPadSheet } from './src/edit/DevPadSheet';
import { engine, usePads } from './src/model/usePads';
import { PadGrid } from './src/play/PadGrid';
import { TopBar } from './src/play/TopBar';
import { tap } from './src/haptics';
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
  const { pads, update, load, clear, loadState } = usePads();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [haptics, setHaptics] = useState(true);
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => engine.subscribe(() => setActiveCount(engine.activeCount())), []);

  // In PLAY il tasto Indietro non fa nulla; in EDIT riporta a PLAY (spec §12).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (editing) setEditing(false);
      return true;
    });
    return () => sub.remove();
  }, [editing]);

  if (!fontsLoaded) return <View style={styles.root} />;

  return (
    <View style={[styles.root, editing && styles.editing]}>
      <StatusBar hidden />
      <NavigationBar hidden />
      <TopBar
        editing={editing}
        setName="PROVA"
        activeCount={activeCount}
        haptics={haptics}
        onToggleHaptics={() => setHaptics((h) => !h)}
        onEdit={() => setEditing(true)}
        onDone={() => setEditing(false)}
        onStopAll={() => {
          engine.stopAll();
          tap(haptics);
        }}
      />
      <PadGrid pads={pads} editing={editing} haptics={haptics} loadState={loadState} onSelect={setSelected} />
      <DevPadSheet
        pad={selected === null ? null : pads[selected - 1]}
        onClose={() => setSelected(null)}
        onLoad={load}
        onUpdate={update}
        onClear={clear}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.chassis },
  editing: { borderWidth: 2, borderColor: colors.edit },
});
