// App di test tecnico M0 (spec §15): verifica motore audio, reverse, loop, fade, multi-touch e uscita audio
// sul dispositivo reale. Verrà sostituita dall'app vera da M2 in poi.
import * as DocumentPicker from 'expo-document-picker';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { ComponentRef, useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AudioBuffer, AudioManager } from 'react-native-audio-api';
import { audioContext, clickBuffer, play, reversed, stop, Voice } from './src/audio/engine';
import { measureLoudness, LoudnessResult } from './src/audio/loudness';

interface PadDef {
  id: string;
  label: string;
  click?: number; // frequenza del click sintetico
  loop?: boolean;
  rev?: boolean;
}

const PADS: PadDef[] = [
  { id: 'clickA', label: 'CLICK A', click: 1000 },
  { id: 'clickB', label: 'CLICK B', click: 1500 },
  { id: 'os', label: 'ONE SHOT' },
  { id: 'loop', label: 'LOOP', loop: true },
  { id: 'osrev', label: 'ONE SHOT REV', rev: true },
  { id: 'looprev', label: 'LOOP REV', loop: true, rev: true },
];
const COLS = 3;
const ROWS = 2;
const FADE_OUT = 3;
const FADE_IN = 2;

interface LoadedFile {
  name: string;
  buffer: AudioBuffer;
  reverse: AudioBuffer;
  loud: LoudnessResult;
  ms: { decode: number; reverse: number; lufs: number };
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const db = (x: number) => (isFinite(x) ? x.toFixed(1) : '—');

export default function App() {
  useKeepAwake();
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);
  const [outputs, setOutputs] = useState('…');
  const [log, setLog] = useState<string[]>([]);
  const [maxTouches, setMaxTouches] = useState(0);
  const [, setTick] = useState(0);
  const voices = useRef<Record<string, Voice>>({});
  const clicks = useRef<Record<string, AudioBuffer>>({});
  const grid = useRef<ComponentRef<typeof View>>(null);
  const gridRect = useRef({ x: 0, y: 0, w: 1, h: 1 });

  const addLog = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString('it-IT')}  ${line}`, ...l].slice(0, 40));

  const refreshOutputs = async () => {
    try {
      const info = await AudioManager.getDevicesInfo();
      setOutputs(info.currentOutputs.map((d) => `${d.name} (${d.category})`).join(', ') || 'nessuna');
    } catch (e) {
      setOutputs(`errore: ${String(e)}`);
    }
  };

  useEffect(() => {
    const c = audioContext();
    addLog(`AudioContext ${c.sampleRate} Hz, stato ${c.state}`);
    for (const p of PADS) if (p.click) clicks.current[p.id] = clickBuffer(p.click);
    refreshOutputs();
    AudioManager.observeAudioInterruptions(true);
    const subs = [
      AudioManager.addSystemEventListener('routeChange', (e) => {
        addLog(`cambio uscita: ${e.reason}`);
        refreshOutputs();
      }),
      AudioManager.addSystemEventListener('interruption', (e) => addLog(`interruzione: ${e.type}`)),
      AudioManager.addSystemEventListener('duck', () => addLog('ducking')),
    ];
    const timer = setInterval(() => setTick((t) => t + 1), 50);
    return () => {
      clearInterval(timer);
      subs.forEach((s) => s?.remove());
    };
  }, []);

  const loadFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (res.canceled) return;
    const asset = res.assets[0];
    setLoading(true);
    try {
      const c = audioContext();
      const t0 = performance.now();
      const buffer = await c.decodeAudioData(asset.uri);
      const t1 = performance.now();
      const reverse = reversed(buffer);
      const t2 = performance.now();
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
      const loud = measureLoudness(channels, buffer.sampleRate);
      const t3 = performance.now();
      Object.values(voices.current).forEach((v) => stop(v));
      setFile({ name: asset.name, buffer, reverse, loud, ms: { decode: t1 - t0, reverse: t2 - t1, lufs: t3 - t2 } });
      addLog(`caricato ${asset.name}: decodifica ${Math.round(t1 - t0)} ms, LUFS ${Math.round(t3 - t2)} ms`);
    } catch (e) {
      addLog(`errore di caricamento: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const trigger = (pad: PadDef) => {
    const current = voices.current[pad.id];
    const playing = current && !current.stopping;
    if (pad.click) {
      if (playing) stop(current);
      voices.current[pad.id] = play(clicks.current[pad.id]);
      return;
    }
    if (!file) return;
    if (playing) {
      stop(current, FADE_OUT);
      return;
    }
    const v = play(pad.rev ? file.reverse : file.buffer, {
      loop: pad.loop,
      fadeIn: fadeIn ? FADE_IN : 0,
      onEnded: () => {
        if (voices.current[pad.id] === v) delete voices.current[pad.id];
      },
    });
    voices.current[pad.id] = v;
  };

  const stopAll = () => Object.values(voices.current).forEach((v) => stop(v));

  // Un'unica superficie touch per tutta la griglia (spec §14.4): ogni dito in `changedTouches` fa partire
  // il pad sotto di sé, anche se due dita toccano nello stesso istante.
  const onTouchStart = (e: GestureResponderEvent) => {
    const { x, y, w, h } = gridRect.current;
    setMaxTouches((m) => Math.max(m, e.nativeEvent.touches.length));
    for (const t of e.nativeEvent.changedTouches) {
      const col = Math.floor(((t.pageX - x) / w) * COLS);
      const row = Math.floor(((t.pageY - y) / h) * ROWS);
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
      trigger(PADS[row * COLS + col]);
    }
  };

  const now = audioContext().currentTime;

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <ScrollView style={styles.side} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
        <Text style={styles.title}>CIRCUS LAUNCHPAD · TEST M0</Text>
        <View style={styles.row}>
          <Pressable style={styles.btn} onPress={loadFile} disabled={loading}>
            <Text style={styles.btnText}>{loading ? 'CARICAMENTO…' : 'CARICA FILE'}</Text>
          </Pressable>
          <Pressable style={[styles.btn, fadeIn && styles.btnOn]} onPress={() => setFadeIn((f) => !f)}>
            <Text style={[styles.btnText, fadeIn && styles.btnTextOn]}>FADE IN {FADE_IN}s</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnStop]} onPress={stopAll}>
            <Text style={styles.btnText}>■ STOP</Text>
          </Pressable>
        </View>
        {file ? (
          <View style={styles.box}>
            <Text style={styles.mono} numberOfLines={1}>{file.name}</Text>
            <Text style={styles.mono}>
              {fmt(file.buffer.duration)} · {file.buffer.sampleRate} Hz · {file.buffer.numberOfChannels} ch ·{' '}
              {Math.round((file.buffer.length * file.buffer.numberOfChannels * 4) / 1e6)} MB in RAM
            </Text>
            <Text style={styles.mono}>
              decodifica {Math.round(file.ms.decode)} ms · reverse {Math.round(file.ms.reverse)} ms · LUFS{' '}
              {Math.round(file.ms.lufs)} ms
            </Text>
            <Text style={styles.mono}>
              integrata {db(file.loud.integratedLufs)} LUFS · momentary max {db(file.loud.momentaryMaxLufs)} · picco{' '}
              {db(file.loud.peakDbfs)} dBFS
            </Text>
          </View>
        ) : (
          <Text style={styles.muted}>Carica un file (meglio uno lungo, 3–5 min) per i pad del file.</Text>
        )}
        <View style={styles.box}>
          <Text style={styles.mono}>uscita: {outputs}</Text>
          <Text style={styles.mono}>tocchi simultanei max: {maxTouches}</Text>
        </View>
        {log.map((l, i) => (
          <Text key={i} style={styles.log}>{l}</Text>
        ))}
      </ScrollView>

      <View
        ref={grid}
        style={styles.grid}
        onLayout={() => grid.current?.measureInWindow((x, y, w, h) => (gridRect.current = { x, y, w, h }))}
        onTouchStart={onTouchStart}
      >
        {PADS.map((p) => {
          const v = voices.current[p.id];
          const active = !!v && (v.loop || now - v.startedAt < v.duration) && !(p.click && now - v.startedAt > 0.1);
          const elapsed = v ? now - v.startedAt : 0;
          const pct = v && v.duration ? ((v.loop ? elapsed % v.duration : Math.min(elapsed, v.duration)) / v.duration) * 100 : 0;
          const disabled = !p.click && !file;
          return (
            <View key={p.id} pointerEvents="none" style={[styles.pad, active && styles.padOn, disabled && styles.padOff]}>
              <Text style={[styles.padLabel, active && styles.padLabelOn]}>{p.label}</Text>
              <Text style={[styles.mono, active && styles.padLabelOn]}>
                {v?.stopping ? 'FADE' : active && !p.click ? (v.loop ? `∞ ×${Math.floor(elapsed / v.duration) + 1}` : `-${fmt(v.duration - elapsed)}`) : ''}
              </Text>
              {active && !p.click && (
                <View style={[styles.bar, { width: `${pct}%` }, p.rev && { left: undefined, right: 0 }]} />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: '#121110', paddingHorizontal: 24, paddingVertical: 12, gap: 16 },
  side: { width: 330, flexGrow: 0 },
  title: { color: '#efe6d6', fontWeight: '700', letterSpacing: 2, fontSize: 13 },
  row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  btn: { borderWidth: 1, borderColor: '#5a534c', borderRadius: 4, paddingHorizontal: 10, paddingVertical: 8 },
  btnOn: { backgroundColor: '#f2a437', borderColor: '#f2a437' },
  btnStop: { borderColor: '#ff6a5c' },
  btnText: { color: '#efe6d6', fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  btnTextOn: { color: '#17130f' },
  box: { borderWidth: 1, borderColor: '#3d3833', borderRadius: 4, padding: 8, gap: 3 },
  mono: { color: '#efe6d6', fontFamily: 'monospace', fontSize: 10 },
  muted: { color: '#a89f92', fontSize: 11 },
  log: { color: '#a89f92', fontFamily: 'monospace', fontSize: 9 },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignContent: 'stretch' },
  pad: {
    width: '31.5%',
    height: '48%',
    backgroundColor: '#3a2a22',
    borderRadius: 6,
    padding: 10,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  padOn: { backgroundColor: '#EF8A33' },
  padOff: { opacity: 0.35 },
  padLabel: { color: '#efe6d6', fontWeight: '700', fontSize: 20 },
  padLabelOn: { color: '#17130f' },
  bar: { position: 'absolute', left: 0, bottom: 0, height: 4, backgroundColor: '#17130f' },
});
