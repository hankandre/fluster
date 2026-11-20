// Browse falsifier for decision 0003: react-native-tvos rows and focus on Android TV.
// Canonical implementation on purpose: no nextFocus* props, no extra focus guides beyond
// the rail, so focus defects show up instead of being papered over.
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, Pressable, StyleSheet, Text, TVFocusGuideView, View, useTVEventHandler } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { PerfOverlay } from "./PerfOverlay";
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
const RAIL_W = u(design.railW);
const SAFE_Y = u(54);
const HERO_H = H * 0.42;

// Experiment switch, inlined at bundle time: EXPO_PUBLIC_ROW_MVCP=off builds a variant with
// FlashList's maintainVisibleContentPosition disabled on the rows. The default build is stock.
const ROW_MVCP_OFF = process.env.EXPO_PUBLIC_ROW_MVCP === "off";
const rowMvcp = ROW_MVCP_OFF ? { disabled: true } : undefined;

const rows = Array.from({ length: ROWS }, (_, r) => r);
const cols = Array.from({ length: COLS }, (_, c) => c);

// The hero is updated through a module-level setter so focus changes never re-render rows.
let showHero: (row: number, col: number) => void = () => {};
let dwellTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleHero(row: number, col: number) {
  if (dwellTimer) clearTimeout(dwellTimer);
  dwellTimer = setTimeout(() => showHero(row, col), design.dwellMs);
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
        source={{ uri: `${ART_BASE}/backdrop/1920/${backdropOf(item.row, item.col)}.jpg` }}
        transition={{ duration: design.crossfadeMs, effect: "cross-dissolve" }}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
      <View style={styles.scrim} pointerEvents="none" />
      <View style={styles.heroText} pointerEvents="none">
        <Text style={styles.heroTitle}>{titleOf(item.row, item.col)}</Text>
        <Text style={styles.heroMeta}>2026 · 1 h 58 min · 4K · Synthetic art</Text>
      </View>
    </>
  );
}

const Card = memo(function Card({ row, col }: { row: number; col: number }) {
  const focus = useSharedValue(0);
  const frame = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (design.lift - 1) * focus.value }],
    borderColor: interpolateColor(focus.value, [0, 1], ["rgba(255,244,220,0)", color.focus]),
  }));
  const onFocus = useCallback(() => {
    focus.value = withTiming(1, { duration: design.liftMs });
    console.log(`FOCUS ${row},${col}`);
    scheduleHero(row, col);
  }, [focus, row, col]);
  const onBlur = useCallback(() => {
    focus.value = withTiming(0, { duration: design.liftMs });
    console.log(`BLUR ${row},${col}`);
  }, [focus, row, col]);
  return (
    <Pressable onFocus={onFocus} onBlur={onBlur} style={styles.card}>
      <Animated.View style={[styles.frame, frame]}>
        <Image
          style={styles.poster}
          source={{ uri: `${ART_BASE}/poster/300/${posterOf(row, col)}.jpg` }}
          recyclingKey={`${row}-${col}`}
          cachePolicy="memory-disk"
          contentFit="cover"
          transition={0}
        />
      </Animated.View>
    </Pressable>
  );
});

const Row = memo(function Row({ row }: { row: number }) {
  const renderCard = useCallback(({ item }: { item: number }) => <Card row={row} col={item} />, [row]);
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{rowTitle(row)}</Text>
      <FlashList
        horizontal
        data={cols}
        renderItem={renderCard}
        keyExtractor={(c) => String(c)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: u(24) }}
        style={{ height: POSTER_H * 1.12 }}
        maintainVisibleContentPosition={rowMvcp}
      />
    </View>
  );
});

const RAIL = ["Home", "Search", "Movies", "Shows", "Settings"];

function RailItem({ label, index }: { label: string; index: number }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onFocus={() => {
        setFocused(true);
        console.log(`FOCUS rail,${index}`);
      }}
      onBlur={() => {
        setFocused(false);
        console.log(`BLUR rail,${index}`);
      }}
      style={[styles.railItem, focused && styles.railItemFocused]}
    >
      <Text style={[styles.railText, focused && styles.railTextFocused]}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
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
    console.log(`BOOT rowMvcpOff=${ROW_MVCP_OFF} window=${W}x${H} posters=${POSTERS} backdrops=${BACKDROPS} rows=${ROWS} cols=${COLS}`);
  }, []);
  return (
    <View style={styles.root}>
      <Hero />
      <View style={styles.layout}>
        <TVFocusGuideView autoFocus style={styles.rail}>
          {RAIL.map((label, i) => (
            <RailItem key={label} label={label} index={i} />
          ))}
        </TVFocusGuideView>
        <View style={styles.content}>
          <FlashList
            data={rows}
            renderItem={renderRow}
            keyExtractor={(r) => String(r)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: SAFE_Y }}
          />
        </View>
      </View>
      {overlay ? <PerfOverlay /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface0 },
  // DESIGN.md §7.2: Home shows the backdrop dimmed under a scrim.
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: color.surface0, opacity: 0.55 },
  heroText: { position: "absolute", left: RAIL_W + u(24), top: SAFE_Y + u(60), width: u(900) },
  heroTitle: { color: color.text1, fontSize: u(design.typeDisplay), fontWeight: "700" },
  heroMeta: { color: color.text2, fontSize: u(design.typeBody), marginTop: u(16) },
  layout: { flex: 1, flexDirection: "row" },
  rail: { width: RAIL_W, paddingTop: SAFE_Y + u(40), paddingLeft: u(48), paddingRight: u(16), backgroundColor: color.railScrim },
  railItem: { paddingVertical: u(14), paddingHorizontal: u(20), borderRadius: u(design.radiusControl), marginBottom: u(8) },
  railItemFocused: { backgroundColor: color.text1 },
  railText: { color: color.text2, fontSize: u(design.typeLabel), fontWeight: "600" },
  railTextFocused: { color: color.onLight },
  content: { flex: 1, marginTop: HERO_H },
  row: { height: ROW_H },
  rowTitle: { color: color.text1, fontSize: ROW_TITLE, fontWeight: "600", marginLeft: u(24), marginBottom: u(16) },
  card: { width: POSTER_W + CARD_GAP, height: POSTER_H * 1.12, justifyContent: "center" },
  frame: {
    width: POSTER_W,
    height: POSTER_H,
    borderRadius: u(design.radiusArt),
    borderWidth: u(3),
    overflow: "hidden",
    backgroundColor: color.surface2,
  },
  poster: { width: "100%", height: "100%" },
});
