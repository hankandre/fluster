#!/usr/bin/env python3
"""Prints one Markdown table row per results folder: python3 scripts/summarize.py results/*"""
import json
import sys
from pathlib import Path


def load(d, name):
    p = Path(d) / name
    return json.loads(p.read_text()) if p.exists() else None


print("| run | flag | singles ok | single failures | bursts diverged | presses after divergence | recycled-cell blurs | burst gap ms | jank % Right / Down | p90 / p99 Right | p90 / p99 Down | PSS idle → scrolled MB | native MB | bitmaps MB | cold start ms (am / React) | images served |")
print("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
for d in sys.argv[1:]:
    f, fr, m, c = (load(d, n) for n in ("focus.json", "frames.json", "memory.json", "coldstart.json"))
    served = ""
    s = Path(d) / "art-server.log"
    if s.exists():
        lines = [l for l in s.read_text().splitlines() if l.startswith("served")]
        served = lines[-1].split()[1] if lines else ""
    row = [Path(d).name]
    if f:
        st = f["stats"]
        inc = st.get("incidents", {})
        singles = inc.get("singles_total")
        sf = st["unexpected_place"] + st["nowhere"] + st["stuck"]
        row += [st.get("flag_enableCustomFocusSearchOnClippedElementsAndroid"),
                f"{singles - sf}/{singles}" if singles else "",
                f"{sf} (wrong {st['unexpected_place']}, nowhere {st['nowhere']}, stuck {st['stuck']})",
                f"{inc.get('bursts_diverged')}/{inc.get('bursts_total')}",
                st.get("burst_presses_after_divergence", st.get("burst_presses_misrouted")),
                st.get("blur_of_recycled_cell"), st.get("burst_achieved_median_gap_ms", "")]
    else:
        row += [""] * 7
    if fr:
        a = fr.get("row_hold_right") or fr["row_right_left"]
        b = fr.get("rows_hold_down") or fr["rows_down_up"]
        row += [f"{a['janky_pct']} / {b['janky_pct']}", f"{a['p90_ms']} / {a['p99_ms']}", f"{b['p90_ms']} / {b['p99_ms']}"]
    else:
        row += [""] * 3
    if m:
        i, s2 = m["idle_after_launch"], m["after_scrolling_all_rows"]
        row += [f"{i.get('total_pss_mb')} → {s2.get('total_pss_mb')}", s2.get("native_heap_mb"), s2.get("bitmaps_malloced_mb")]
    else:
        row += [""] * 3
    row.append(f"{c['median_total_ms']} / {c.get('median_first_react_commit_ms', '')}" if c else "")
    row.append(served)
    print("| " + " | ".join("" if x is None else str(x) for x in row) + " |")
