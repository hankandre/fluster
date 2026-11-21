// T2-09 frozen tests for the tripwire's expectation table (tripwire-expectations.ts). Docker-free.
// Signatures chosen here (the implementer follows them):
//   SERVERS: readonly { name, label, kind }[]; SAMPLES: readonly { name, videoCodec?, ... }[]
//   CAPABILITY_SETS: Record<CapabilitySetName, { lacks?, samples }>; capabilitiesOf(set)
//   expectationFor(serverName, set, sampleName): Expectation
//   runPlan(optIn: boolean): { server, set, sample, expect }[]   (server and sample are names)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUDIO_CODECS, HDR_TYPES, VIDEO_CODECS } from "../../packages/core/src/domain/player-engine";
import {
  CAPABILITY_SETS,
  JELLYSCALE_FORCED_CONVERSION,
  SAMPLES,
  SERVERS,
  capabilitiesOf,
  expectationFor,
  runPlan,
} from "./tripwire-expectations";

const JELLYFIN = ["jellyfin-10-11", "jellyfin-12"] as const;
const ALL = ["jellyfin-10-11", "jellyfin-12", "jellyscale"] as const;
const PLAYABLE = [
  "h264", "hevc-hdr10", "av1", "ass", "sidecar-srt", "multitrack", "multitrack-audio-pick", "versions",
  "dvdsub", "show-s01e01", "show-s01e02", "show-s00e01",
];
const SETS = ["no-h264", "no-hevc", "no-av1"] as const;
// The sample that lacks the codec, then the control that does not.
const PAIRS = {
  "no-h264": { lacking: "h264", control: "hevc-hdr10" },
  "no-hevc": { lacking: "hevc-hdr10", control: "h264" },
  "no-av1": { lacking: "av1", control: "h264" },
} as const;

describe("T2-09 item 1: three servers, one run plan", () => {
  it("SERVERS names the three compose services and their kinds", () => {
    expect(SERVERS.map((server) => [server.name, server.kind])).toEqual([
      ["jellyfin-10-11", "jellyfin"],
      ["jellyfin-12", "jellyfin"],
      ["jellyscale", "jellyscale"],
    ]);
    expect(SERVERS.map((server) => server.label)).toEqual(["10.11", "12.4", "Jellyscale"]);
  });

  it("runPlan under full holds every sample for every server, each with an expectation", () => {
    for (const optIn of [true, false]) {
      const rows = runPlan(optIn).filter((row) => row.set === "full");
      const names = SAMPLES.filter((sample) => optIn || !["dvdsub", "iso"].includes(sample.name)).map((sample) => sample.name);
      for (const server of ALL) {
        expect(rows.filter((row) => row.server === server).map((row) => row.sample).sort(), `${server} optIn=${optIn}`).toEqual([...names].sort());
      }
      for (const row of rows) expect(row.expect?.kind, `${row.server} ${row.sample}`).toBeTruthy();
    }
    expect(runPlan(false).some((row) => ["dvdsub", "iso"].includes(row.sample))).toBe(false);
    expect(runPlan(true).some((row) => row.sample === "iso")).toBe(true);
  });

  it("SAMPLES keeps the sixteen sample names and gives the film samples a video codec", () => {
    expect(SAMPLES.map((sample) => sample.name).sort()).toEqual(
      [...PLAYABLE, "bluray-folder", "h264-limited", "iso", "bluray-noconv"].sort(),
    );
    const codecOf = (name: string) => SAMPLES.find((sample) => sample.name === name)?.videoCodec;
    expect(codecOf("h264")).toBe("h264");
    expect(codecOf("hevc-hdr10")).toBe("hevc");
    expect(codecOf("av1")).toBe("av1");
    expect(codecOf("bluray-folder")).toBeUndefined();
    expect(codecOf("iso")).toBeUndefined();
  });

  it("the capability sets are full plus three complete lists that each lack one video codec", () => {
    expect(Object.keys(CAPABILITY_SETS).sort()).toEqual(["full", "no-av1", "no-h264", "no-hevc"]);
    expect(capabilitiesOf("full")).toBe("full");
    const lacks = { "no-h264": "h264", "no-hevc": "hevc", "no-av1": "av1" } as const;
    for (const set of SETS) {
      const caps = capabilitiesOf(set);
      if (caps === "full") throw new Error("a lacking set is not full");
      expect(caps.probe).toBe("complete");
      if (caps.probe !== "complete") continue;
      expect(caps.videoDecoders.map((decoder) => decoder.codec).sort(), set).toEqual(VIDEO_CODECS.filter((codec) => codec !== lacks[set]).sort());
      for (const decoder of caps.videoDecoders) {
        expect(decoder.maxWidth, set).toBeUndefined();
        expect(decoder.maxHeight, set).toBeUndefined();
        expect(decoder.maxBitDepth, set).toBeUndefined();
        expect(decoder.profile, set).toBeUndefined();
      }
      expect([...caps.audioDecoders].sort(), set).toEqual([...AUDIO_CODECS].sort());
      expect([...caps.hdr].sort(), set).toEqual([...HDR_TYPES].sort());
      expect(caps.passthrough, set).toEqual([]);
    }
  });

  it("each lacking set runs exactly the lacking sample and its control on every server", () => {
    const rows = runPlan(true);
    for (const set of SETS) {
      for (const server of ALL) {
        const names = rows.filter((row) => row.server === server && row.set === set).map((row) => row.sample).sort();
        expect(names, `${server} ${set}`).toEqual([PAIRS[set].lacking, PAIRS[set].control].sort());
      }
    }
  });
});

describe("T2-09 item 2: full capabilities direct play every playable sample", () => {
  it("expectationFor(server, full, sample) is direct-play on all three servers", () => {
    for (const server of ALL) {
      for (const sample of PLAYABLE) {
        expect(expectationFor(server, "full", sample).kind, `${server} ${sample}`).toBe("direct-play");
      }
    }
  });

  it("the sidecar sample still expects its external subtitle on the Jellyfin servers", () => {
    for (const server of JELLYFIN) {
      expect(expectationFor(server, "full", "sidecar-srt")).toEqual({ kind: "direct-play", externalSubtitle: true });
    }
  });
});

describe("T2-09 item 3: a set lacking the codec converts with the client reason on Jellyfin", () => {
  it("the lacking sample is a Transcode conversion with DeviceCannotPlay on both Jellyfin servers", () => {
    for (const server of JELLYFIN) {
      for (const set of SETS) {
        expect(expectationFor(server, set, PAIRS[set].lacking), `${server} ${set}`).toEqual({
          kind: "conversion",
          methods: ["Transcode"],
          clientReason: "DeviceCannotPlay",
        });
      }
    }
  });

  it("the control sample under each set is direct play on both Jellyfin servers", () => {
    for (const server of JELLYFIN) {
      for (const set of SETS) {
        expect(expectationFor(server, set, PAIRS[set].control).kind, `${server} ${set}`).toBe("direct-play");
      }
    }
  });
});

describe("T2-09 item 4: the expected result is stated per server", () => {
  it("JELLYSCALE_FORCED_CONVERSION is the typed cannot-play refusal", () => {
    expect(JELLYSCALE_FORCED_CONVERSION).toEqual({ kind: "refused", reason: "device-cannot-play" });
  });

  it("every Jellyscale lacking row is that constant and the control direct plays", () => {
    for (const set of SETS) {
      expect(expectationFor("jellyscale", set, PAIRS[set].lacking), set).toBe(JELLYSCALE_FORCED_CONVERSION);
      expect(expectationFor("jellyscale", set, PAIRS[set].control).kind, set).toBe("direct-play");
    }
  });

  it("the Jellyfin servers do not read the constant", () => {
    for (const server of JELLYFIN) {
      for (const set of SETS) expect(expectationFor(server, set, PAIRS[set].lacking)).not.toBe(JELLYSCALE_FORCED_CONVERSION);
    }
  });

  it("the refusal value is written in one place in the module", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "tripwire-expectations.ts"), "utf8");
    expect(source.match(/["']device-cannot-play["']/g)?.length).toBe(1);
  });

  it("every (server, set, sample) in the plan has an expectation that expectationFor agrees with", () => {
    for (const row of runPlan(true)) {
      expect(row.expect, `${row.server} ${row.set} ${row.sample}`).toEqual(expectationFor(row.server, row.set, row.sample));
    }
  });
});

describe("T2-09 item 5: disc, ISO, forced limit and the restricted user", () => {
  const BOTH = ["DirectStream", "Transcode"];
  it("on both Jellyfin servers the four rows equal today's", () => {
    for (const server of JELLYFIN) {
      expect(expectationFor(server, "full", "bluray-folder")).toEqual({ kind: "conversion", methods: BOTH });
      expect(expectationFor(server, "full", "iso")).toEqual({ kind: "conversion", methods: BOTH });
      expect(expectationFor(server, "full", "h264-limited")).toEqual({
        kind: "conversion",
        methods: ["Transcode"],
        reasonsAnyOf: ["ContainerBitrateExceedsLimit", "VideoBitrateNotSupported"],
      });
      expect(expectationFor(server, "full", "bluray-noconv")).toEqual({ kind: "refused", reason: "conversion-not-allowed" });
    }
  });

  it("on Jellyscale each of the four is stated, and a not-run row names a reason and a precondition", () => {
    for (const sample of ["bluray-folder", "iso", "h264-limited", "bluray-noconv"]) {
      const row = expectationFor("jellyscale", "full", sample);
      expect(["conversion", "direct-play", "refused", "not-run"], sample).toContain(row.kind);
      if (row.kind === "not-run") {
        expect(row.reason.trim().length, sample).toBeGreaterThan(0);
        expect(row.precondition.trim().length, sample).toBeGreaterThan(0);
      }
    }
  });

  it("on Jellyscale bluray-noconv is not-run for want of a restricted user", () => {
    const row = expectationFor("jellyscale", "full", "bluray-noconv");
    expect(row.kind).toBe("not-run");
    if (row.kind === "not-run") expect(row.precondition).toBe("no-restricted-credentials");
  });

  it("on Jellyscale the forced-limit run is the positive control: a Transcode conversion", () => {
    const row = expectationFor("jellyscale", "full", "h264-limited");
    expect(row.kind).toBe("conversion");
    if (row.kind === "conversion") expect(row.methods).toEqual(["Transcode"]);
  });

  it("a not-run ISO row, if Jellyscale lists none, carries the not-listed precondition", () => {
    const row = expectationFor("jellyscale", "full", "iso");
    if (row.kind === "not-run") expect(row.precondition).toBe("not-listed");
  });
});
