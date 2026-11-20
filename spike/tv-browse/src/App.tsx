// Browse falsifier for decision 0003: react-native-tvos rows and focus on Android TV.
// The stock arm is the canonical implementation: no nextFocus* props and no focus guides beyond
// the rail, so focus defects show up. The optimisation pass (RESULTS.md) adds fixes behind the
// arm flags in ./arm.ts, one at a time, so each one can be measured on its own.
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dimensions, Pressable, StyleSheet, Text, TVFocusGuideView, View, useTVEventHandler } from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Image } from "expo-image";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { ARM, loadArm, trap } from "./arm";
import { PerfOverlay } from "./PerfOverlay";
import { GuideView, Rail, RAIL_COLLAPSED_W, edgeGuideRef } from "./Rail";
import { ART_BASE, BACKDROPS, COLS, POSTERS, ROWS, backdropOf, posterOf, rowTitle, titleOf } from "./data";
import { color, design } from "./tokens";

const { width: W, height: H } = Dimensions.get("window");
// Design units are the 1920x1080 TV canvas from DESIGN.md §6; scale them to the window.
const u = (px: number) => (px * W) / 1920;

const POSTER_W = u(design.posterW);
const POSTER_H = (POSTER_W * 3) / 2;
const CARD_GAP = u(design.cardGap);
const ROW_TITLE = u(design.typeHeading);
const ROW_H = ROW_TITLE + u(16) + POSTER_H * 1.12 + u(design.rowGap);
const SAFE_Y = u(54);
const HERO_H = H * 0.42;

const rows = Array.from({ length: ROWS }, (_, r) => r);
const cols = Array.from({ length: COLS }, (_, c) => c);

// The hero is updated through a module-level setter so focus changes never re-render rows.
let showHero: (row: number, col: number) => void = () => {};
let dwellTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleHero(row: number, col: number) {
  if (dwellTimer) clearTimeout(dwellTimer);
  dwellTimer = setTimeout(() => showHero(row, col), design.dwellMs);
}

// Which native view shows which card, so the rail can send Right back to the card the user
// left, but only while that view still shows it (FlashList recycles views).
type CardView = React.ComponentRef<typeof Pressable>;
const cardViews = new Map<string, CardView>();
let lastCard: string | undefined;
function lastCardView(): CardView | undefined {
  return lastCard ? cardViews.get(lastCard) : undefined;
}

// Each row's own horizontal offset (arm rowMemory).
const rowOffsets: number[] = [];

// Arm traps: when a row's first card takes focus, scroll the row fully home. Otherwise the
// horizontal scroll view can still scroll the row's left padding, and Android spends the next
// Left press on that scroll instead of leaving for the rail (the "stuck at column 0" defect).
const rowLists = new Map<number, FlashListRef<number>>();
function scrollRowHome(row: number) {
  rowLists.get(row)?.scrollToOffset({ offset: 0, animated: false });
}

// Held Up/Down detection (arm lazyPosters): two row changes less than HELD_MS apart.
const HELD_MS = 150;
let focusedRow = -1;
let lastRowChange = 0;
let holding = false;
function noteRow(row: number) {
  if (row === focusedRow) return;
  const now = Date.now();
  holding = now - lastRowChange < HELD_MS;
  lastRowChange = now;
  focusedRow = row;
}
// Resolves once no row change has happened for HELD_MS.
function whenSettled(cb: () => void) {
  const wait = () => {
    const quiet = Date.now() - lastRowChange;
    if (quiet >= HELD_MS) {
      holding = false;
      cb();
    } else setTimeout(wait, HELD_MS - quiet);
  };
  return setTimeout(wait, HELD_MS);
}

function Hero() {
  const [item, setItem] = useState({ row: 0, col: 0 });
  useEffect(() => {
    showHero = (row, col) => setItem({ row, col });
  }, []);
  return (
    <>
      <Image
        style={StyleSheet.absoluteFill}
        source={{ uri: `${ART_BASE}/backdrop/${ARM.backdropW}/${backdropOf(item.row, item.col)}.jpg` }}
        transition={ARM.crossfadeMs > 0 ? { duration: ARM.crossfadeMs, effect: "cross-dissolve" } : 0}
        contentFit="cover"
        cachePolicy={ARM.diskOnly ? "disk" : "memory-disk"}
      />
      <View style={styles.scrim} pointerEvents="none" />
      <View style={styles.heroText} pointerEvents="none">
        <Text style={styles.heroTitle}>{titleOf(item.row, item.col)}</Text>
        <Text style={styles.heroMeta}>2026 · 1 h 58 min · 4K · Synthetic art</Text>
      </View>
    </>
  );
}

function useCardView(row: number, col: number, ref: React.RefObject<CardView | null>) {
  const key = `${row},${col}`;
  useEffect(() => {
    const view = ref.current;
    if (view) cardViews.set(key, view);
    return () => {
      if (cardViews.get(key) === view) cardViews.delete(key);
    };
  }, [key, ref]);
  return key;
}

function Poster({ row, col, show }: { row: number; col: number; show: boolean }) {
  if (!show) return null;
  return (
    <Image
      style={styles.poster}
      source={{ uri: `${ART_BASE}/poster/300/${posterOf(row, col)}.jpg` }}
      recyclingKey={`${row}-${col}`}
      cachePolicy={ARM.diskOnly ? "disk" : "memory-disk"}
      decodeFormat={ARM.rgb ? "rgb" : "argb"}
      contentFit="cover"
      transition={0}
    />
  );
}

type CardProps = { row: number; col: number; show: boolean };

const AnimatedCard = memo(function AnimatedCard({ row, col, show }: CardProps) {
  const ref = useRef<CardView>(null);
  const key = useCardView(row, col, ref);
  const focus = useSharedValue(0);
  const frame = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (design.lift - 1) * focus.value }],
    borderColor: interpolateColor(focus.value, [0, 1], ["rgba(255,244,220,0)", color.focus]),
  }));
  const onFocus = useCallback(() => {
    focus.value = withTiming(1, { duration: design.liftMs });
    lastCard = key;
    noteRow(row);
    if (col === 0 && trap("row")) scrollRowHome(row);
    console.log(`FOCUS ${key}`);
    scheduleHero(row, col);
  }, [focus, key, row, col]);
  const onBlur = useCallback(() => {
    focus.value = withTiming(0, { duration: design.liftMs });
    console.log(`BLUR ${key}`);
  }, [focus, key]);
  return (
    <Pressable ref={ref} onFocus={onFocus} onBlur={onBlur} style={styles.card}>
      <Animated.View style={[styles.frame, frame]}>
        <Poster row={row} col={col} show={show} />
      </Animated.View>
    </Pressable>
  );
});

// Arm plainLift: the same lift and ring as a static style switched from onFocus, no animation.
const PlainCard = memo(function PlainCard({ row, col, show }: CardProps) {
  const ref = useRef<CardView>(null);
  const key = useCardView(row, col, ref);
  const [focused, setFocused] = useState(false);
  const onFocus = useCallback(() => {
    setFocused(true);
    lastCard = key;
    noteRow(row);
    if (col === 0 && trap("row")) scrollRowHome(row);
    console.log(`FOCUS ${key}`);
    scheduleHero(row, col);
  }, [key, row, col]);
  const onBlur = useCallback(() => {
    setFocused(false);
    console.log(`BLUR ${key}`);
  }, [key]);
  return (
    <Pressable ref={ref} onFocus={onFocus} onBlur={onBlur} style={styles.card}>
      <View style={[styles.frame, focused && styles.frameFocused]}>
        <Poster row={row} col={col} show={show} />
      </View>
    </Pressable>
  );
});

const Row = memo(function Row({ row }: { row: number }) {
  const Card = ARM.plainLift ? PlainCard : AnimatedCard;
  // Arm lazyPosters: a row recycled during a held Up/Down renders without poster images and
  // loads them once the key is released, so the held key does not start ~8 image loads per row.
  const [show, setShow] = useState(true);
  const deferred = ARM.lazyPosters && holding;
  useLayoutEffect(() => {
    if (!deferred) return;
    setShow(false);
    const t = whenSettled(() => setShow(true));
    return () => clearTimeout(t);
  }, [row, deferred]);
  const showNow = show && !deferred;
  const renderCard = useCallback(
    ({ item }: { item: number }) => <Card row={row} col={item} show={showNow} />,
    [row, Card, showNow],
  );
  const listRef = useRef<FlashListRef<number>>(null);
  const shown = useRef(row);
  useEffect(() => {
    if (listRef.current) rowLists.set(row, listRef.current);
    return () => {
      if (rowLists.get(row) === listRef.current) rowLists.delete(row);
    };
  }, [row]);
  // FlashList recycles this row's view, with its horizontal scroll view and offset, for
  // another row. Restore the new row's own offset before it paints.
  useLayoutEffect(() => {
    if (!ARM.rowMemory || shown.current === row) return;
    shown.current = row;
    listRef.current?.scrollToOffset({ offset: rowOffsets[row] ?? 0, animated: false });
  }, [row]);
  const onScroll = useCallback((e: { nativeEvent: { contentOffset: { x: number } } }) => {
    rowOffsets[shown.current] = e.nativeEvent.contentOffset.x;
  }, []);
  const list = (
    <FlashList
      ref={listRef}
      horizontal
      data={cols}
      renderItem={renderCard}
      keyExtractor={(c) => String(c)}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: u(24) }}
      style={{ height: POSTER_H * 1.12 }}
      maintainVisibleContentPosition={ARM.mvcpOff ? { disabled: true } : undefined}
      onScroll={ARM.rowMemory ? onScroll : undefined}
      drawDistance={ARM.rowDrawDistance}
      maxItemsInRecyclePool={ARM.rowPool}
    />
  );
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{rowTitle(row)}</Text>
      {/* Arm traps: Right past the last card stays in the row. */}
      {trap("row") ? <TVFocusGuideView trapFocusRight>{list}</TVFocusGuideView> : list}
    </View>
  );
});

function Home() {
  const [overlay, setOverlay] = useState(false);
  const renderRow = useCallback(({ item }: { item: number }) => <Row row={item} />, []);
  const toggled = useRef(false);
  useTVEventHandler((evt) => {
    // Play/Pause toggles the perf overlay (off by default so it does not perturb measurements).
    if (evt.eventType === "playPause" && !toggled.current) {
      toggled.current = true;
      setOverlay((v) => !v);
      setTimeout(() => (toggled.current = false), 300);
    }
  });
  useEffect(() => {
    console.log(
      `BOOT arm=${JSON.stringify(ARM)} rowMvcpOff=${ARM.mvcpOff} window=${W}x${H} posters=${POSTERS} backdrops=${BACKDROPS} rows=${ROWS} cols=${COLS}`,
    );
  }, []);
  return (
    <View style={styles.root}>
      <Hero />
      {/* First in tree order, so the first D-pad press lands on the rail as before; zIndex
          draws it over the rows when it expands. */}
      <Rail returnTo={lastCardView} />
      <View style={styles.content}>
        {/* Arm traps: Left from a row's first card lands on this thin guide, which sends focus
            to the rail item the user last used. */}
        {trap("edge") ? <GuideView ref={edgeGuideRef} style={styles.edgeGuide} /> : null}
        <FlashList
          data={rows}
          renderItem={renderRow}
          keyExtractor={(r) => String(r)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: SAFE_Y }}
          drawDistance={ARM.drawDistance}
        />
      </View>
      {overlay ? <PerfOverlay /> : null}
    </View>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    loadArm().then(() => setReady(true));
  }, []);
  return ready ? <Home /> : <View style={styles.root} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface0 },
  // DESIGN.md §7.2: Home shows the backdrop dimmed under a scrim.
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: color.surface0, opacity: 0.55 },
  heroText: { position: "absolute", left: RAIL_COLLAPSED_W + u(24), top: SAFE_Y + u(60), width: u(900) },
  heroTitle: { color: color.text1, fontSize: u(design.typeDisplay), fontWeight: "700" },
  heroMeta: { color: color.text2, fontSize: u(design.typeBody), marginTop: u(16) },
  // The rail is collapsed to icons and overlays the content when it expands, so the content
  // starts at the collapsed rail's edge and never reflows.
  content: { position: "absolute", left: RAIL_COLLAPSED_W, right: 0, top: HERO_H, bottom: 0 },
  edgeGuide: { position: "absolute", left: 0, top: 0, bottom: 0, width: 2 },
  row: { height: ROW_H },
  rowTitle: { color: color.text1, fontSize: ROW_TITLE, fontWeight: "600", marginLeft: u(24), marginBottom: u(16) },
  card: { width: POSTER_W + CARD_GAP, height: POSTER_H * 1.12, justifyContent: "center" },
  frame: {
    width: POSTER_W,
    height: POSTER_H,
    borderRadius: u(design.radiusArt),
    borderWidth: u(3),
    borderColor: "rgba(255,244,220,0)",
    overflow: "hidden",
    backgroundColor: color.surface2,
  },
  frameFocused: { borderColor: color.focus, transform: [{ scale: design.lift }] },
  poster: { width: "100%", height: "100%" },
});
