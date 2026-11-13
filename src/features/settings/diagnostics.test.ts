import { describe, expect, it } from "vitest";
import { diagnosticsText, hostLabel, libmpvVersionText, osName, safeServerVersion, safeValue, type DiagnosticsInput } from "./diagnostics";

const native: DiagnosticsInput = {
  appVersion: "0.1.0",
  os: "Linux",
  player: { kind: "native", libmpvVersion: "mpv 0.41.0", renderer: "gl" },
  decode: { mode: "hardware", hwdec: "vaapi" },
  serverVersion: "10.11.7",
  hostClass: "private-lan",
};

describe("diagnosticsText", () => {
  it("is exactly seven lines with fixed prefixes", () => {
    const lines = diagnosticsText(native).split("\n");
    expect(lines).toEqual([
      "Fluster 0.1.0",
      "OS: Linux",
      "Player: native, libmpv 0.41.0",
      "Renderer: gl",
      "Decode: hardware (vaapi)",
      "Jellyfin: 10.11.7",
      "Server: local network",
    ]);
  });

  it("covers the player branches", () => {
    const line = (player: DiagnosticsInput["player"]) => diagnosticsText({ ...native, player }).split("\n");
    expect(line({ kind: "browser" })[2]).toBe("Player: browser (development)");
    expect(line({ kind: "browser" })[3]).toBe("Renderer: none");
    expect(line({ kind: "checking" })[2]).toBe("Player: checking");
    expect(line({ kind: "unavailable" })[2]).toBe("Player: unavailable");
    expect(line({ kind: "native" })[2]).toBe("Player: native, libmpv Unknown");
    expect(line({ kind: "native" })[3]).toBe("Renderer: Unknown");
    for (const player of [{ kind: "browser" }, { kind: "checking" }, { kind: "unavailable" }, { kind: "native" }] as const) {
      expect(line(player)).toHaveLength(7);
    }
  });

  it("covers the decode branches", () => {
    const decode = (value: DiagnosticsInput["decode"]) => diagnosticsText({ ...native, decode: value }).split("\n")[4];
    expect(decode({ mode: "hardware", hwdec: "vaapi" })).toBe("Decode: hardware (vaapi)");
    expect(decode({ mode: "hardware" })).toBe("Decode: hardware");
    expect(decode({ mode: "software" })).toBe("Decode: software");
    expect(decode(undefined)).toBe("Decode: no playback yet");
  });

  it("covers the server lines", () => {
    const lines = diagnosticsText({ ...native, serverVersion: undefined, hostClass: "public" }).split("\n");
    expect(lines[5]).toBe("Jellyfin: Unknown");
    expect(lines[6]).toBe("Server: remote");
  });
});

describe("safeValue", () => {
  it("hides URLs and fills empty values", () => {
    expect(safeValue("https://media.test/x")).toBe("Hidden");
    expect(safeValue("")).toBe("Unknown");
    expect(safeValue(undefined)).toBe("Unknown");
    expect(safeValue("   ")).toBe("Unknown");
  });

  it("flattens newlines and control characters", () => {
    expect(safeValue("a\nb\u0007c")).toBe("a b c");
  });

  it("truncates to 80 characters", () => {
    expect(safeValue("x".repeat(200))).toHaveLength(80);
  });
});

describe("safeServerVersion", () => {
  it("accepts dotted numbers only", () => {
    expect(safeServerVersion("10.11.7")).toBe("10.11.7");
    expect(safeServerVersion("12.4")).toBe("12.4");
    expect(safeServerVersion("10.11.7-beta <script>")).toBe("Unknown");
    expect(safeServerVersion("http://x")).toBe("Unknown");
    expect(safeServerVersion("")).toBe("Unknown");
    expect(safeServerVersion(undefined)).toBe("Unknown");
  });
});

describe("libmpvVersionText", () => {
  it("drops the leading mpv that mpv's own version string carries", () => {
    expect(libmpvVersionText("mpv 0.41.0")).toBe("0.41.0");
    expect(libmpvVersionText("mpv 0.38.0-dirty")).toBe("0.38.0-dirty");
    expect(libmpvVersionText("0.41.0")).toBe("0.41.0");
    expect(libmpvVersionText(undefined)).toBe("Unknown");
  });
});

describe("osName", () => {
  it("names the platform and never returns the user-agent", () => {
    expect(osName("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15")).toBe("Linux");
    expect(osName("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36")).toBe("Android");
    expect(osName("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15")).toBe("macOS");
    expect(osName("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")).toBe("Windows");
    expect(osName("curl/8")).toBe("Unknown");
  });
});

describe("hostLabel", () => {
  it("splits like the streaming limits", () => {
    expect(hostLabel("loopback")).toBe("local network");
    expect(hostLabel("private-lan")).toBe("local network");
    expect(hostLabel("public")).toBe("remote");
  });
});
