// Griglia 4×3 con un'unica superficie touch (spec §14.4, D-26): ogni dito in `changedTouches` agisce sul pad
// sotto di sé, quindi due pad toccati nello stesso istante partono entrambi. Gli spazi tra i pad non reagiscono.
import { ComponentRef, useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, StyleSheet, View } from 'react-native';
import { PadSnapshot } from '../audio/engine';
import { LoadState, engine } from '../model/usePads';
import { PAD_COUNT, PadConfig } from '../model/pads';
import { tap } from '../haptics';
import { layout } from '../theme';
import { DownAction, HOLD_OVERLAY_DELAY_MS, HOLD_TO_STOP_MS, holdStops, IGNORED_HINT_MS, onDown } from './gesture';
import { PadView } from './PadView';

interface Props {
  pads: PadConfig[];
  editing: boolean;
  haptics: boolean;
  loadState: LoadState | null;
  onSelect: (slot: number) => void;
}

interface ActiveTouch {
  slot: number;
  action: DownAction;
  t0: number;
  holdFired: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

interface Frame {
  busy: boolean;
  blinkOn: boolean;
  snaps: PadSnapshot[];
  holds: (number | null)[];
  hints: boolean[];
}

function computeFrame(touches: Map<number, ActiveTouch>, hints: Map<number, number>): Frame {
  const now = Date.now();
  const snaps = Array.from({ length: PAD_COUNT }, (_, i) => engine.snapshot(i + 1));
  const holds: (number | null)[] = snaps.map(() => null);
  for (const t of touches.values()) {
    const ms = now - t.t0;
    if (holdStops(t.action) && !t.holdFired && ms > HOLD_OVERLAY_DELAY_MS && snaps[t.slot - 1].phase === 'playing') {
      holds[t.slot - 1] = ms / HOLD_TO_STOP_MS;
    }
  }
  const hintFlags = snaps.map((_, i) => (hints.get(i + 1) ?? 0) > now);
  return {
    busy: touches.size > 0 || hintFlags.some(Boolean) || snaps.some((s) => s.phase !== 'idle'),
    blinkOn: Math.floor(now / 250) % 2 === 0,
    snaps,
    holds,
    hints: hintFlags,
  };
}

export function PadGrid({ pads, editing, haptics, loadState, onSelect }: Props) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const rect = useRef({ x: 0, y: 0, w: 1, h: 1 });
  const touches = useRef(new Map<number, ActiveTouch>());
  const hints = useRef(new Map<number, number>()); // slot → scadenza del suggerimento
  const [frame, setFrame] = useState<Frame>(() => computeFrame(new Map(), new Map()));

  // Ricalcola lo stato da disegnare a ogni frame finché qualcosa si muove (voci, pressioni lunghe,
  // suggerimenti, LED che lampeggia); a riposo un solo frame finale e poi niente render.
  useEffect(() => {
    let raf = 0;
    let wasBusy = true;
    const loop = () => {
      const f = computeFrame(touches.current, hints.current);
      if (f.busy || wasBusy) setFrame(f);
      wasBusy = f.busy;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const slotAt = (pageX: number, pageY: number): number | null => {
    const { x, y, w, h } = rect.current;
    const cellW = (w - layout.gap * (layout.cols - 1)) / layout.cols;
    const cellH = (h - layout.gap * (layout.rows - 1)) / layout.rows;
    const lx = pageX - x;
    const ly = pageY - y;
    const col = Math.floor(lx / (cellW + layout.gap));
    const row = Math.floor(ly / (cellH + layout.gap));
    if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows) return null;
    // Nello spazio tra due pad il tocco non conta.
    if (lx - col * (cellW + layout.gap) > cellW || ly - row * (cellH + layout.gap) > cellH) return null;
    return row * layout.cols + col + 1;
  };

  const onTouchStart = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const slot = slotAt(t.pageX, t.pageY);
      if (slot === null) continue;
      if (editing) {
        onSelect(slot);
        continue;
      }
      const pad = pads[slot - 1];
      if (!pad.sample || !engine.isLoaded(slot)) continue;

      const action = onDown(engine.snapshot(slot).phase, pad.retrigger);
      // Prima il suono, poi la vibrazione (spec §5.3.1).
      if (action === 'start') engine.start(slot);
      else if (action === 'stop') engine.stop(slot);
      tap(haptics);

      const touch: ActiveTouch = { slot, action, t0: Date.now(), holdFired: false, timer: null };
      if (holdStops(action)) {
        touch.timer = setTimeout(() => {
          touch.holdFired = true;
          if (engine.snapshot(slot).phase === 'playing') engine.stop(slot);
        }, HOLD_TO_STOP_MS);
      }
      touches.current.set(t.identifier, touch);
    }
  };

  const release = (e: GestureResponderEvent, cancelled: boolean) => {
    for (const t of e.nativeEvent.changedTouches) {
      const touch = touches.current.get(t.identifier);
      if (!touch) continue;
      touches.current.delete(t.identifier);
      if (touch.timer) clearTimeout(touch.timer);
      if (cancelled || touch.holdFired) continue;
      if (touch.action === 'restart-on-release') engine.start(touch.slot);
      else if (touch.action === 'hold') hints.current.set(touch.slot, Date.now() + IGNORED_HINT_MS);
    }
  };

  const rows = Array.from({ length: layout.rows }, (_, r) => pads.slice(r * layout.cols, (r + 1) * layout.cols));

  return (
    <View
      ref={ref}
      style={styles.grid}
      onLayout={() =>
        ref.current?.measureInWindow((x, y, w, h) => {
          // Area dei pad, senza i margini morti della griglia.
          rect.current = {
            x: x + layout.sideMargin,
            y: y + layout.gridTop,
            w: w - 2 * layout.sideMargin,
            h: h - layout.gridTop - layout.bottomMargin,
          };
        })
      }
      onTouchStart={onTouchStart}
      onTouchEnd={(e) => release(e, false)}
      onTouchCancel={(e) => release(e, true)}
    >
      {rows.map((row, r) => (
        <View key={r} style={styles.row} pointerEvents="none">
          {row.map((pad) => {
            const i = pad.slot - 1;
            return (
              <View key={pad.slot} style={styles.cell}>
                <PadView
                  pad={pad}
                  snap={frame.snaps[i]}
                  hold={frame.holds[i]}
                  hint={frame.hints[i]}
                  blinkOn={frame.blinkOn}
                  editing={editing}
                  status={loadState?.slot === pad.slot ? loadState.message : undefined}
                />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flex: 1,
    gap: layout.gap,
    paddingTop: layout.gridTop,
    paddingHorizontal: layout.sideMargin,
    paddingBottom: layout.bottomMargin,
  },
  row: { flex: 1, flexDirection: 'row', gap: layout.gap },
  cell: { flex: 1 },
});
