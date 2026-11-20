#!/usr/bin/env python3
"""Re-derives focus.json and memory.json from a results folder's raw captures with the current
analyser (used when the oracle or parser changes after a run): reanalyse.py results/<run>"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import falsifier as f  # noqa: E402

for d in map(Path, sys.argv[1:]):
    lines = (d / "focus-logcat.txt").read_text(errors="replace").splitlines()
    windows, flag, boot = f.parse_windows(lines)
    initial = None
    for line in lines:
        if "FLUSTER_PRESS" in line:
            break
        m = f.FOCUS_RE.search(line)
        if m and m.group(1) == "FOCUS":
            initial = ("rail", int(m.group(3))) if m.group(2) == "rail" else ("card", int(m.group(2)), int(m.group(3)))
    stats, detail = f.analyse_focus(windows, initial)
    old = json.loads((d / "focus.json").read_text())["stats"]
    for k in ("seconds", "injector", "settle_s", "burst_gap_s"):
        stats[k] = old.get(k)
    gaps = [b["median_gap_ms"] for b in f.segments(lines) if b["median_gap_ms"] is not None]
    stats["burst_achieved_median_gap_ms"] = f.statistics.median(gaps) if gaps else None
    stats.update(flag_enableCustomFocusSearchOnClippedElementsAndroid=flag, boot=boot, initial_focus=initial,
                 windows=len(windows), reanalysed=True)
    (d / "focus.json").write_text(json.dumps({"stats": stats, "failures": detail}, indent=1))
    mp = d / "meminfo-raw.txt"
    raw = mp.read_text().split("====") if mp.exists() else []
    if len(raw) == 2:
        mem = json.loads((d / "memory.json").read_text())
        for key, text in zip(("idle_after_launch", "after_scrolling_all_rows"), raw):
            f.sh = lambda s, c, text=text: text
            mem[key] = f.meminfo(None, None)[0]
        (d / "memory.json").write_text(json.dumps(mem, indent=1))
    print(d, "reanalysed")
