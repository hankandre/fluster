// Toggle with Play/Pause. Shows JS-thread FPS (requestAnimationFrame) and JS stalls: an
// interval that fires late by more than 50 ms counts as a stall. UI-thread jank is measured
// with `dumpsys gfxinfo`, not here.
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

export function PerfOverlay() {
  const [stats, setStats] = useState({ fps: 0, stalls: 0, worst: 0 });
  useEffect(() => {
    let frames = 0;
    let raf = 0;
    const tick = () => {
      frames += 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    let stalls = 0;
    let worst = 0;
    let last = Date.now();
    const probe = setInterval(() => {
      const now = Date.now();
      const late = now - last - 16;
      if (late > 50) {
        stalls += 1;
        worst = Math.max(worst, late);
        console.log(`STALL ${late}ms`);
      }
      last = now;
    }, 16);
    const report = setInterval(() => {
      setStats({ fps: frames, stalls, worst });
      frames = 0;
    }, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(probe);
      clearInterval(report);
    };
  }, []);
  return (
    <View style={styles.box} pointerEvents="none">
      <Text style={styles.text}>JS fps {stats.fps}</Text>
      <Text style={styles.text}>JS stalls &gt;50ms {stats.stalls}</Text>
      <Text style={styles.text}>worst {stats.worst} ms</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: "absolute", right: 16, top: 16, padding: 8, backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 6 },
  text: { color: "#8fd1a8", fontSize: 12, fontFamily: "monospace" },
});
