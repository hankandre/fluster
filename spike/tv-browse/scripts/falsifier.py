#!/usr/bin/env python3
"""Browse falsifier measurements against one adb serial (stdlib only).

Subcommands: focus, frames, memory, coldstart, all. Results go to --out as JSON and text.
Focus oracle: every press is preceded on the device by `log -t FLUSTER_PRESS "<n> <KEY>"`,
so the app's FOCUS/BLUR lines (tag ReactNativeJS) between two markers belong to that press.
"""
import argparse
import os
import json
import re
import statistics
import subprocess
import sys
import time
from pathlib import Path

KEYS = {"RIGHT": 22, "LEFT": 21, "DOWN": 20, "UP": 19}
# Bursts and holds: by default a `monkey -f` script (one process, DispatchPress + UserWait
# 50 ms), which imitates a held key on every device. `input` starts a JVM per call (~700 ms on
# the Shield, Android 11), so a paced `input` loop cannot. FALSIFIER_BURST=paced uses that loop
# anyway; FALSIFIER_BURST=oneshot sends all keycodes in one `input` call, a key flood (stress,
# not a held key: on the emulator 49 Rights gave 19 focus events).
BURST_MODE = "monkey"
ROWS, COLS, RAIL = 20, 50, 5
KEYNAMES = {"RIGHT": "KEYCODE_DPAD_RIGHT", "LEFT": "KEYCODE_DPAD_LEFT", "DOWN": "KEYCODE_DPAD_DOWN", "UP": "KEYCODE_DPAD_UP"}


def burst_cmd(tool, key, n, gap):
    if BURST_MODE == "oneshot":
        return f"{tool} keyevent {' '.join([str(KEYS[key])] * n)}"
    if BURST_MODE == "paced":
        return f"for k in $(seq {n}); do {tool} keyevent {KEYS[key]}; sleep {gap}; done"
    body = "".join(f"DispatchPress({KEYNAMES[key]})\\nUserWait({int(gap * 1000)})\\n" for _ in range(n))
    path = "/data/local/tmp/fluster-burst.txt"
    return (f"printf 'type= raw events\\ncount= 1\\nspeed= 1.0\\nstart data >>\\n{body}' > {path}; "
            f"monkey -f {path} 1 >/dev/null 2>&1")


def adb(serial, *args, check=True, capture=True):
    cmd = ["adb", "-s", serial, *args]
    res = subprocess.run(cmd, capture_output=capture, text=True)
    if check and res.returncode != 0:
        raise SystemExit(f"adb failed: {' '.join(args)}\n{res.stderr}")
    return res.stdout if capture else ""


def sh(serial, script):
    return adb(serial, "shell", script)


def detect_input(serial):
    """Prefer `cmd input` (binder call, fast); fall back to `input` (spawns app_process)."""
    best = None
    for tool in ("cmd input", "input"):
        t0 = time.time()
        out = sh(serial, f"for i in 1 2 3 4 5; do {tool} keyevent 0 2>&1 || echo FAIL; done")
        dt = (time.time() - t0) / 5
        # Android 11 has a `cmd input` service that prints "No shell command implementation."
        # and exits 0 without injecting anything, so any output at all disqualifies a tool.
        if out.strip():
            continue
        if best is None or dt < best[1]:
            best = (tool, dt)
    if best is None:
        raise SystemExit("no working key injection on device")
    return best


def launch(serial, pkg, activity, settle=6.0):
    sh(serial, f"am force-stop {pkg}")
    out = sh(serial, f"am start -W -n {pkg}/{activity}")
    time.sleep(settle)
    # After `am start` the window is in touch mode with nothing focused; the first D-pad
    # press only exits touch mode and focuses the first focusable (rail item 0). That
    # priming press is not counted.
    sh(serial, 'log -t FLUSTER_PRESS "seg launch"; input keyevent 21; sleep 1')
    return out


class Logcat:
    def __init__(self, serial, path):
        adb(serial, "logcat", "-G", "16M", check=False)
        adb(serial, "logcat", "-c")
        self.path = path
        self.fh = open(path, "w")
        self.proc = subprocess.Popen(
            ["adb", "-s", serial, "logcat", "-v", "epoch", "-s", "ReactNativeJS:I", "FLUSTER_PRESS:I", "FLUSTER_FLAG:I"],
            stdout=self.fh, stderr=subprocess.DEVNULL, text=True)

    def stop(self):
        time.sleep(1.5)
        self.proc.terminate()
        self.proc.wait()
        self.fh.close()
        return Path(self.path).read_text(errors="replace").splitlines()


# ---------------------------------------------------------------- focus test

def plan_presses(total=500):
    """Returns a list of steps: ("single", KEY) or ("burst", KEY, n). Each press counts once."""
    steps = []
    count = lambda: sum(1 if s[0] == "single" else s[2] for s in steps)
    # 1. Enter content, Right through row 0, one past the end, Left back, Left into rail.
    steps.append(("single", "RIGHT"))
    steps += [("single", "RIGHT")] * 50
    steps += [("single", "LEFT")] * 49
    steps.append(("single", "LEFT"))
    # 2. Back out, Down through all rows, one past the bottom, Up back to row 0.
    steps.append(("single", "RIGHT"))
    steps += [("single", "DOWN")] * 20
    steps += [("single", "UP")] * 19
    # 3. Rail in and out at several depths and columns.
    for _ in range(8):
        steps += [("single", "DOWN"), ("single", "DOWN")]
        steps += [("single", "RIGHT")] * 5
        steps += [("single", "LEFT")] * 5
        steps += [("single", "LEFT"), ("single", "DOWN"), ("single", "UP"), ("single", "RIGHT")]
    steps += [("single", "UP")] * 16
    # 4. Clipped jumps: fast bursts (20/s, like a held key) far along a row, then cross rows
    #    whose own scroll position differs, then come back.
    while count() < total:
        left = total - count()
        for step in (("burst", "RIGHT", 20), ("single", "DOWN"), ("single", "UP"),
                     ("burst", "RIGHT", 15), ("single", "DOWN"), ("burst", "LEFT", 10),
                     ("single", "UP"), ("burst", "LEFT", 30), ("single", "DOWN")):
            n = 1 if step[0] == "single" else step[2]
            if n > left:
                step = ("burst", step[1], left) if left > 1 else ("single", step[1])
                n = left
            steps.append(step)
            left -= n
            if left <= 0:
                break
    assert count() == total, count()
    return steps


def device_script(steps, tool, settle, burst_gap):
    lines = []
    for i, s in enumerate(steps):
        if s[0] == "single":
            lines.append(f'log -t FLUSTER_PRESS "{i} single {s[1]} 1"; {tool} keyevent {KEYS[s[1]]}; sleep {settle}')
        else:
            lines.append(f'log -t FLUSTER_PRESS "{i} burst {s[1]} {s[2]}"; '
                         f'{burst_cmd(tool, s[1], s[2], burst_gap)}; sleep {settle * 2}')
    lines.append('log -t FLUSTER_PRESS "end"')
    return "\n".join(lines) + "\n"


FOCUS_RE = re.compile(r"(FOCUS|BLUR) (rail|\d+),(\d+)")


def parse_windows(lines):
    """Groups FOCUS/BLUR events by press marker."""
    windows, cur, flag, boot = [], None, None, None
    for line in lines:
        if "FLUSTER_FLAG" in line and "enableCustom" in line:
            flag = line.split("enableCustomFocusSearchOnClippedElementsAndroid=")[-1].strip()
        if "BOOT " in line and "window=" in line:
            boot = line.split("BOOT ")[-1].strip()
        if "FLUSTER_PRESS" in line:
            payload = line.split(":", 3)[-1].strip() if "FLUSTER_PRESS:" not in line else line.split("FLUSTER_PRESS:")[-1].strip()
            payload = payload.split("FLUSTER_PRESS")[-1].lstrip(": ").strip()
            parts = payload.split()
            if parts and parts[0] == "end":
                cur = None
                continue
            if len(parts) >= 4 and parts[0].isdigit():
                cur = {"i": int(parts[0]), "kind": parts[1], "key": parts[2], "n": int(parts[3]), "events": []}
                windows.append(cur)
            else:
                cur = None
            continue
        m = FOCUS_RE.search(line)
        if m and cur is not None:
            target = ("rail", int(m.group(3))) if m.group(2) == "rail" else ("card", int(m.group(2)), int(m.group(3)))
            cur["events"].append((m.group(1), target))
    return windows, flag, boot


def expected(state, key):
    """Returns a predicate over the new state, and a label. None state = nothing focused."""
    if state is None:
        return (lambda s: s is not None), "anything"
    if state[0] == "rail":
        i = state[1]
        if key == "RIGHT":
            return (lambda s: s is not None and s[0] == "card"), "a card"
        if key == "LEFT":
            return (lambda s: s == state), "stay"
        j = i + (1 if key == "DOWN" else -1)
        j = min(max(j, 0), RAIL - 1)
        return (lambda s: s == ("rail", j)), f"rail {j}"
    _, r, c = state
    if key == "RIGHT":
        t = ("card", r, min(c + 1, COLS - 1))
        return (lambda s: s == t), f"{t[1]},{t[2]}"
    if key == "LEFT":
        if c == 0:
            return (lambda s: s is not None and s[0] == "rail"), "rail"
        t = ("card", r, c - 1)
        return (lambda s: s == t), f"{t[1]},{t[2]}"
    rr = r + (1 if key == "DOWN" else -1)
    if rr < 0 or rr >= ROWS:
        return (lambda s: s == state), "stay"
    return (lambda s: s is not None and s[0] == "card" and s[1] == rr), f"row {rr}"


def step(state, key):
    """Ideal single-press move inside a row (used for bursts along a row)."""
    if state[0] == "rail":
        return state if key == "LEFT" else None
    _, r, c = state
    if key == "RIGHT":
        return ("card", r, min(c + 1, COLS - 1))
    return ("card", r, c - 1) if c > 0 else ("rail", None)


def burst_trajectory(state, key, n):
    """Expected focus moves for n presses of LEFT/RIGHT; None if not modelled."""
    if state is None or key not in ("RIGHT", "LEFT") or (state[0] == "rail" and key != "LEFT"):
        return None
    moves, cur = [], state
    for _ in range(n):
        nxt = step(cur, key)
        if nxt is None:
            return None
        if nxt[0] == "rail" and cur[0] == "rail":
            nxt = cur
        if nxt != cur:
            moves.append(nxt)
        cur = nxt
    return moves, cur


def analyse_focus(windows, initial):
    state = initial
    stats = {"presses": 0, "ok": 0, "unexpected_place": 0, "nowhere": 0, "stuck": 0,
             "burst_presses_after_divergence": 0, "blur_of_recycled_cell": 0}
    detail, down_cols, rail_return = [], [], {"same_card": 0, "other_card": 0}
    last_card_before_rail = None
    focused_now = initial
    for w in windows:
        for kind, t in w["events"]:
            if kind == "BLUR" and focused_now is not None and t != focused_now:
                # The native view that held focus now carries another item's props: FlashList
                # recycled the focused cell.
                stats["blur_of_recycled_cell"] += 1
                detail.append({"press": w["i"], "key": w["key"], "verdict": "BLUR of recycled cell",
                               "focused_was": focused_now, "blur_reported": t})
            if kind == "FOCUS":
                focused_now = t
        focuses = [t for kind, t in w["events"] if kind == "FOCUS"]
        blurs = [t for kind, t in w["events"] if kind == "BLUR"]
        new = focuses[-1] if focuses else (None if blurs else state)
        if w["kind"] == "single":
            stats["presses"] += 1
            pred, label = expected(state, w["key"])
            if pred(new):
                stats["ok"] += 1
                verdict = "ok"
            elif not focuses and blurs:
                stats["nowhere"] += 1
                verdict = "nowhere"
            elif not focuses and not blurs:
                stats["stuck"] += 1
                verdict = "stuck"
            else:
                stats["unexpected_place"] += 1
                verdict = "unexpected"
            if state and state[0] == "card" and w["key"] in ("DOWN", "UP") and new and new[0] == "card" and new[1] != state[1]:
                down_cols.append(new[2] - state[2])
            if state and state[0] == "card" and new and new[0] == "rail":
                last_card_before_rail = state
            if state and state[0] == "rail" and w["key"] == "RIGHT" and new and new[0] == "card" and last_card_before_rail:
                rail_return["same_card" if new == last_card_before_rail else "other_card"] += 1
            if verdict != "ok":
                detail.append({"press": w["i"], "key": w["key"], "from": state, "expected": label, "got": new, "verdict": verdict})
        else:
            stats["presses"] += w["n"]
            want = burst_trajectory(state, w["key"], w["n"])
            if want is None:
                stats["ok"] += w["n"]
            else:
                moves, final = want
                matched = 0
                same = lambda a, b: a == b or (a[0] == b[0] == "rail" and None in (a[1], b[1]))
                while matched < min(len(moves), len(focuses)) and same(focuses[matched], moves[matched]):
                    matched += 1
                if matched == len(moves) == len(focuses):
                    stats["ok"] += w["n"]
                else:
                    bad = w["n"] - matched
                    stats["ok"] += matched
                    stats["burst_presses_after_divergence"] += bad
                    detail.append({"press": w["i"], "key": f"burst {w['key']}x{w['n']}", "from": state,
                                   "expected_final": final, "got": new, "verdict": f"{bad} presses misrouted",
                                   "first_divergence": focuses[matched] if matched < len(focuses) else "no further focus events"})
        state = new
    stats["column_offset_on_row_change"] = {
        "n": len(down_cols),
        "same_col": sum(1 for d in down_cols if d == 0),
        "mean_abs": round(statistics.mean(abs(d) for d in down_cols), 2) if down_cols else None,
        "max_abs": max((abs(d) for d in down_cols), default=None),
    }
    stats["rail_exit_returns_to_last_card"] = rail_return
    stats["incidents"] = {
        "single_press_failures": stats["unexpected_place"] + stats["nowhere"] + stats["stuck"],
        "bursts_diverged": sum(1 for d in detail if str(d.get("key", "")).startswith("burst")),
        "bursts_total": sum(1 for w in windows if w["kind"] == "burst"),
        "singles_total": sum(1 for w in windows if w["kind"] == "single"),
    }
    return stats, detail


def segments(lines):
    """Splits a logcat capture at `FLUSTER_PRESS: seg <name>` / `<n> burst ...` markers and
    reports per segment: focus events, final focus, and the median gap between focus events
    (the achieved press rate; a real held key repeats about every 50 ms)."""
    out, cur = [], None
    for line in lines:
        parts = line.split()
        try:
            ts = float(parts[0])
        except (ValueError, IndexError):
            continue
        if "FLUSTER_PRESS:" in line:
            payload = line.split("FLUSTER_PRESS:")[-1].split()
            if payload and (payload[0] == "seg" or (len(payload) > 1 and payload[1] == "burst")):
                cur = {"name": " ".join(payload), "focus": [], "ts": []}
                out.append(cur)
            elif payload and payload[0] != "seg":
                cur = None
            continue
        m = FOCUS_RE.search(line)
        if m and m.group(1) == "FOCUS" and cur is not None:
            cur["focus"].append(f"{m.group(2)},{m.group(3)}")
            cur["ts"].append(ts)
    res = []
    for seg in out:
        gaps = [round((b - a) * 1000) for a, b in zip(seg["ts"], seg["ts"][1:])]
        res.append({"segment": seg["name"], "focus_events": len(seg["focus"]),
                    "first": seg["focus"][0] if seg["focus"] else None,
                    "final": seg["focus"][-1] if seg["focus"] else None,
                    "median_gap_ms": statistics.median(gaps) if gaps else None})
    return res


def run_focus(serial, pkg, activity, out, tool, settle):
    log = Logcat(serial, out / "focus-logcat.txt")
    launch(serial, pkg, activity)
    lines_boot = Path(out / "focus-logcat.txt").read_text(errors="replace").splitlines()
    initial_focus = None
    for line in lines_boot:
        m = FOCUS_RE.search(line)
        if m and m.group(1) == "FOCUS":
            initial_focus = ("rail", int(m.group(3))) if m.group(2) == "rail" else ("card", int(m.group(2)), int(m.group(3)))
    steps = plan_presses(500)
    script = device_script(steps, tool, settle, 0.05)
    (out / "presses.sh").write_text(script)
    adb(serial, "push", str(out / "presses.sh"), "/data/local/tmp/fluster-presses.sh")
    t0 = time.time()
    sh(serial, "sh /data/local/tmp/fluster-presses.sh")
    elapsed = time.time() - t0
    lines = log.stop()
    windows, flag, boot = parse_windows(lines)
    stats, detail = analyse_focus(windows, initial_focus)
    bursts = segments(lines)
    gaps = [b["median_gap_ms"] for b in bursts if b["median_gap_ms"] is not None]
    stats["burst_achieved_median_gap_ms"] = statistics.median(gaps) if gaps else None
    if gaps and statistics.median(gaps) > 120:
        print(f"WARNING: bursts ran at {statistics.median(gaps)} ms per press; that is not a held key", file=sys.stderr)
    stats.update({"flag_enableCustomFocusSearchOnClippedElementsAndroid": flag, "boot": boot,
                  "initial_focus": initial_focus, "windows": len(windows), "seconds": round(elapsed, 1),
                  "injector": tool, "settle_s": settle, "burst_gap_s": 0.05})
    (out / "focus.json").write_text(json.dumps({"stats": stats, "failures": detail}, indent=1))
    return stats, detail


# ---------------------------------------------------------------- frames

def gfx(serial, pkg):
    text = sh(serial, f"dumpsys gfxinfo {pkg}")
    def grab(pat, cast=float):
        m = re.search(pat, text)
        return cast(m.group(1)) if m else None
    return {
        "frames": grab(r"Total frames rendered: (\d+)", int),
        "janky": grab(r"Janky frames: (\d+)", int),
        "janky_pct": grab(r"Janky frames: \d+ \(([\d.]+)%\)"),
        "p50_ms": grab(r"50th percentile: (\d+)ms", int),
        "p90_ms": grab(r"90th percentile: (\d+)ms", int),
        "p95_ms": grab(r"95th percentile: (\d+)ms", int),
        "p99_ms": grab(r"99th percentile: (\d+)ms", int),
        "missed_vsync": grab(r"Number Missed Vsync: (\d+)", int),
        "slow_ui": grab(r"Number Slow UI thread: (\d+)", int),
        "slow_draw": grab(r"Number Slow issue draw commands: (\d+)", int),
        "frame_deadline_missed": grab(r"Number Frame deadline missed: (\d+)", int),
    }, text


def hold(serial, tool, key, n, gap=0.05, label=None):
    mark = f'log -t FLUSTER_PRESS "seg {label or key + "x" + str(n)}"; ' 
    sh(serial, f"{mark}{burst_cmd(tool, key, n, gap)}; sleep 1")


def run_frames(serial, pkg, activity, out, tool):
    """Two segments, each from a fresh launch so one segment's focus defects cannot move the
    next one's start: hold Right along row 0 to its end, and hold Down from row 0 to row 19.
    Only Right and Down are used, because Left can jump (see RESULTS.md)."""
    log = Logcat(serial, out / "frames-logcat.txt")
    res, raws = {}, []
    for name, key in (("row_hold_right", "RIGHT"), ("rows_hold_down", "DOWN")):
        launch(serial, pkg, activity)
        hold(serial, tool, "RIGHT", 1, label=f"{name} enter")  # rail -> row 0
        time.sleep(2)
        sh(serial, f"dumpsys gfxinfo {pkg} reset")
        hold(serial, tool, key, 49 if key == "RIGHT" else 19, label=f"{name} hold {key}")
        res[name], raw = gfx(serial, pkg)
        raws.append(raw)
    res["segments"] = segments(log.stop())
    (out / "gfxinfo-raw.txt").write_text("\n\n====\n\n".join(raws))
    (out / "frames.json").write_text(json.dumps(res, indent=1))
    return res


# ---------------------------------------------------------------- memory

def meminfo(serial, pkg):
    text = sh(serial, f"dumpsys meminfo {pkg}")
    def summary(label):
        m = re.search(rf"^\s*{label}:\s+(\d+)", text, re.M)
        return int(m.group(1)) // 1024 if m else None  # MB
    res = {k: summary(lbl) for k, lbl in [
        ("java_heap_mb", "Java Heap"), ("native_heap_mb", "Native Heap"), ("code_mb", "Code"),
        ("stack_mb", "Stack"), ("graphics_mb", "Graphics"), ("private_other_mb", "Private Other"),
        ("system_mb", "System")]}
    m = re.search(r"TOTAL PSS:\s+(\d+)\s+TOTAL RSS:\s+(\d+)\s+TOTAL SWAP (?:PSS|\(KB\)):\s+(\d+)", text)
    if m:
        res.update(total_pss_mb=int(m.group(1)) // 1024, total_rss_mb=int(m.group(2)) // 1024,
                   total_swap_pss_mb=int(m.group(3)) // 1024)
    else:
        m = re.search(r"TOTAL:\s+(\d+)", text)
        res["total_pss_mb"] = int(m.group(1)) // 1024 if m else None
    # GPU memory as the vendor driver tracks it. On the Shield (Tegra) most of it is "Other mtrack",
    # which dumpsys counts under Private Other, not Graphics.
    for label, key in (("EGL mtrack", "egl_mtrack_mb"), ("GL mtrack", "gl_mtrack_mb"), ("Other mtrack", "other_mtrack_mb")):
        mt = re.search(rf"^\s*{label}\s+(\d+)", text, re.M)
        if mt:
            res[key] = int(mt.group(1)) // 1024
    b = re.search(r"Bitmap \(malloced\):\s+(\d+)\s+(\d+)", text)
    if b:
        res["bitmaps_malloced"] = int(b.group(1))
        res["bitmaps_malloced_mb"] = int(b.group(2)) // 1024
    # Google TV memory guidance: anonymous + swap. Approximated as Java + Native + Private Other + swap.
    if None not in (res.get("java_heap_mb"), res.get("native_heap_mb"), res.get("private_other_mb")):
        gpu_in_other = res.get("other_mtrack_mb", 0) + res.get("gl_mtrack_mb", 0)
        res["anon_swap_approx_mb"] = (res["java_heap_mb"] + res["native_heap_mb"] + res["private_other_mb"]
                                      - gpu_in_other + res.get("total_swap_pss_mb", 0))
        res["graphics_incl_mtrack_mb"] = res["graphics_mb"] + gpu_in_other
    return res, text


def run_memory(serial, pkg, activity, out, tool):
    log = Logcat(serial, out / "memory-logcat.txt")
    launch(serial, pkg, activity, settle=8)
    idle, raw0 = meminfo(serial, pkg)
    hold(serial, tool, "RIGHT", 1, label="enter")
    for r in range(20):
        hold(serial, tool, "RIGHT", 49, label=f"row {r} right")
        if r < 19:
            hold(serial, tool, "DOWN", 1, label=f"row {r} down")
    time.sleep(5)
    after, raw1 = meminfo(serial, pkg)
    (out / "meminfo-raw.txt").write_text(raw0 + "\n\n====\n\n" + raw1)
    lines = log.stop()
    segs = segments(lines)
    visited = {}
    for line in lines:
        m = FOCUS_RE.search(line)
        if m and m.group(1) == "FOCUS" and m.group(2) != "rail":
            r, c = int(m.group(2)), int(m.group(3))
            visited[r] = max(visited.get(r, 0), c)
    rows_reached = {str(r): visited[r] for r in sorted(visited)}  # row -> furthest column focused
    res = {"idle_after_launch": idle, "after_scrolling_all_rows": after,  # i.e. after the scroll pass
           "rows_focused_furthest_col": rows_reached, "segments": segs}
    (out / "memory.json").write_text(json.dumps(res, indent=1))
    return res


# ---------------------------------------------------------------- cold start

def run_coldstart(serial, pkg, activity, out, runs=5):
    results = []
    for _ in range(runs):
        sh(serial, f"am force-stop {pkg}")
        time.sleep(2)
        adb(serial, "logcat", "-c")
        t_host = time.time()
        text = sh(serial, f"am start -W -n {pkg}/{activity}")
        m = re.search(r"TotalTime: (\d+)", text)
        w = re.search(r"WaitTime: (\d+)", text)
        time.sleep(4)
        # Time to the app's first React commit: from ActivityManager's "Start proc" line to the
        # app's BOOT line (logged in a useEffect after the first render), both device clock.
        lines = adb(serial, "logcat", "-d", "-v", "epoch", "-s", "ActivityManager:I", "ReactNativeJS:I").splitlines()
        start = next((float(l.split()[0]) for l in lines if "Start proc" in l and pkg in l), None)
        boot = next((float(l.split()[0]) for l in lines if "BOOT " in l and "window=" in l), None)
        js_ms = round((boot - start) * 1000) if start and boot else None
        results.append({"total_ms": int(m.group(1)) if m else None, "wait_ms": int(w.group(1)) if w else None,
                        "proc_start_to_first_react_commit_ms": js_ms})
    totals = [r["total_ms"] for r in results if r["total_ms"] is not None]
    js = [r["proc_start_to_first_react_commit_ms"] for r in results if r["proc_start_to_first_react_commit_ms"]]
    res = {"runs": results, "median_total_ms": statistics.median(totals) if totals else None,
           "median_first_react_commit_ms": statistics.median(js) if js else None,
           "min_total_ms": min(totals, default=None), "max_total_ms": max(totals, default=None)}
    (out / "coldstart.json").write_text(json.dumps(res, indent=1))
    return res


def device_info(serial):
    props = {k: sh(serial, f"getprop {k}").strip() for k in
             ["ro.product.model", "ro.product.manufacturer", "ro.build.version.release", "ro.build.version.sdk",
              "ro.config.low_ram", "ro.product.cpu.abi", "ro.hardware"]}
    props["mem_total"] = sh(serial, "grep MemTotal /proc/meminfo").strip()
    props["display"] = sh(serial, "wm size; wm density").strip().replace("\n", "; ")
    return props


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["focus", "frames", "memory", "coldstart", "all"])
    ap.add_argument("--serial", required=True)
    ap.add_argument("--pkg", default="dev.fluster.spike.browse")
    ap.add_argument("--activity", default=".MainActivity")
    ap.add_argument("--out", required=True)
    ap.add_argument("--settle", type=float, default=0.6, help="seconds after each single press")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    global BURST_MODE
    tool, per = detect_input(args.serial)
    BURST_MODE = os.environ.get("FALSIFIER_BURST", "monkey")  # monkey | paced | oneshot
    if per > 0.1 and BURST_MODE == "paced":
        print(f"WARNING: one key injection takes {per * 1000:.0f} ms; paced bursts will be slower than a held key", file=sys.stderr)
    sh(args.serial, "input keyevent 224")  # KEYCODE_WAKEUP: a sleeping TV swallows the first press
    info = device_info(args.serial)
    info["injector"] = f"{tool} ({per * 1000:.0f} ms per call incl. adb round trip / 5)"
    info["burst_mode"] = {"monkey": "monkey script, press + 50 ms wait",
                          "paced": "input loop, one call per key + 50 ms",
                          "oneshot": "one input call, back-to-back keycodes (stress, not a held key)"}[BURST_MODE]
    (out / "device.json").write_text(json.dumps(info, indent=1))
    print(json.dumps(info, indent=1))
    if args.what in ("coldstart", "all"):
        print("coldstart", json.dumps(run_coldstart(args.serial, args.pkg, args.activity, out), indent=1))
    if args.what in ("focus", "all"):
        stats, detail = run_focus(args.serial, args.pkg, args.activity, out, tool, args.settle)
        print("focus", json.dumps(stats, indent=1))
        for d in detail[:40]:
            print("  ", d)
    if args.what in ("frames", "all"):
        print("frames", json.dumps(run_frames(args.serial, args.pkg, args.activity, out, tool), indent=1))
    if args.what in ("memory", "all"):
        print("memory", json.dumps(run_memory(args.serial, args.pkg, args.activity, out, tool), indent=1))


if __name__ == "__main__":
    sys.exit(main())
