// What each tripwire row must do, per server, capability set and sample (T2-09). Pure: it imports only the codec
// vocabulary and types from the core, and writes the expectations out rather than deriving them from core code, so
// the oracle stays independent of the code it checks. T8-20 (on-device tripwire) and T10-08 (Jellyscale honouring
// the forced flags) read this table.
import { AUDIO_CODECS, HDR_TYPES, VIDEO_CODECS, type PlayerCapabilities, type VideoCodec } from "../../packages/core/src/domain/player-engine";
import type { Expectation, ServerKind } from "./tripwire-rules";

export type { ServerKind } from "./tripwire-rules";

// name is the compose service and the .credentials prefix.
export const SERVERS = [
  { name: "jellyfin-10-11", label: "10.11", kind: "jellyfin" },
  { name: "jellyfin-12", label: "12.4", kind: "jellyfin" },
  { name: "jellyscale", label: "Jellyscale", kind: "jellyscale" },
] as const;
export type ServerName = (typeof SERVERS)[number]["name"];

export type CapabilitySetName = "full" | "no-h264" | "no-hevc" | "no-av1";

// Items are found by path, because metadata matching renames some titles.
// user: "restricted" plays as octave-noconv (setup-servers.sh), whose policy forbids video and audio transcoding
// and remuxing. limitMbps: the local streaming limit the gateway reads for this run; absent is "No limit".
// optIn: generated only with OCTAVE_CONVERSION_SAMPLES=1. videoCodec: the sample's video codec, none for the disc
// and the ISO.
export interface SampleDef {
  name: string;
  path: string;
  videoCodec?: VideoCodec;
  user?: "restricted";
  limitMbps?: number;
  optIn?: boolean;
  // P17-08: play with the second audio track picked, through the gateway's audio pick options.
  audioPick?: "second";
}

const BLURAY = "/media/movies/Synthetic BluRay (2024)";
const H264 = "/media/movies/Synthetic H264 (2024)/Synthetic H264 (2024).mkv";
const MULTITRACK = "/media/movies/Synthetic Multitrack (2024)/Synthetic Multitrack (2024).mkv";

export const SAMPLES: readonly SampleDef[] = [
  { name: "h264", path: H264, videoCodec: "h264" },
  { name: "hevc-hdr10", path: "/media/movies/Synthetic HEVC HDR10 (2024)/Synthetic HEVC HDR10 (2024).mkv", videoCodec: "hevc" },
  { name: "av1", path: "/media/movies/Synthetic AV1 (2024)/Synthetic AV1 (2024).mkv", videoCodec: "av1" },
  { name: "ass", path: "/media/movies/Synthetic ASS (2024)/Synthetic ASS (2024).mkv", videoCodec: "h264" },
  { name: "sidecar-srt", path: "/media/movies/Synthetic Sidecar (2024)/Synthetic Sidecar (2024).mkv", videoCodec: "h264" },
  { name: "multitrack", path: MULTITRACK, videoCodec: "h264" },
  // P17-08: a viewer's audio pick on the first negotiation must still direct play (I1) and select no job.
  { name: "multitrack-audio-pick", path: MULTITRACK, videoCodec: "h264", audioPick: "second" },
  { name: "versions", path: "/media/movies/Synthetic Versions (2024)/Synthetic Versions (2024) - 1080p.mkv", videoCodec: "h264" },
  { name: "dvdsub", path: "/media/movies/Synthetic DVDSub (2024)/Synthetic DVDSub (2024).mkv", videoCodec: "h264", optIn: true },
  { name: "show-s01e01", path: "/media/shows/Synthetic Show/Season 01/Synthetic Show S01E01.mkv", videoCodec: "h264" },
  { name: "show-s01e02", path: "/media/shows/Synthetic Show/Season 01/Synthetic Show S01E02.mkv", videoCodec: "h264" },
  { name: "show-s00e01", path: "/media/shows/Synthetic Show/Season 00/Synthetic Show S00E01.mkv", videoCodec: "h264" },
  { name: "bluray-folder", path: BLURAY },
  // 0.2 Mbit/s is below the sample's ~0.5 Mbit/s and below Octave's lowest offered limit (2 Mbit/s), so this run
  // injects its own limit store; the gateway still reads it the way it reads the user's setting.
  { name: "h264-limited", path: H264, videoCodec: "h264", limitMbps: 0.2 },
  { name: "iso", path: "/media/movies/Synthetic ISO (2024)/Synthetic ISO (2024).iso", optIn: true },
  { name: "bluray-noconv", path: BLURAY, user: "restricted" },
];

// A lacking set is a complete capability list that holds every video codec but one. Each runs the sample whose
// codec is missing and one control with a codec the set has (D2, D3 in docs/specs/T2-09.md).
export const CAPABILITY_SETS: Record<CapabilitySetName, { lacks?: VideoCodec; samples: "all" | readonly string[] }> = {
  full: { samples: "all" },
  "no-h264": { lacks: "h264", samples: ["h264", "hevc-hdr10"] },
  "no-hevc": { lacks: "hevc", samples: ["hevc-hdr10", "h264"] },
  "no-av1": { lacks: "av1", samples: ["av1", "h264"] },
};

export function capabilitiesOf(set: CapabilitySetName): "full" | PlayerCapabilities {
  const lacks = CAPABILITY_SETS[set].lacks;
  if (!lacks) return "full";
  return {
    probe: "complete",
    videoDecoders: VIDEO_CODECS.filter((codec) => codec !== lacks).map((codec) => ({ codec, hardware: true })),
    audioDecoders: [...AUDIO_CODECS],
    // Every HDR type, so a later rule that reads it cannot turn the hevc-hdr10 control into a conversion.
    hdr: [...HDR_TYPES],
    passthrough: [],
  };
}

// Jellyscale ignores EnableDirectPlay and AllowVideoStreamCopy (Jellyscale #224), so the core refuses with
// device-cannot-play. T10-08 makes this a conversion like the Jellyfin servers' and changes it here, and only here.
export const JELLYSCALE_FORCED_CONVERSION: Expectation = { kind: "refused", reason: "device-cannot-play" };

const DIRECT: Expectation = { kind: "direct-play" };
const BOTH_METHODS = ["DirectStream", "Transcode"] as const;

function kindOf(serverName: string): ServerKind {
  const server = SERVERS.find((candidate) => candidate.name === serverName);
  if (!server) throw new Error(`unknown server ${serverName}`);
  return server.kind;
}

function fullExpectation(kind: ServerKind, sample: string): Expectation {
  if (kind === "jellyscale") {
    switch (sample) {
      case "bluray-noconv":
        return { kind: "not-run", reason: "Jellyscale has no user who may not convert (backlog)", precondition: "no-restricted-credentials" };
      case "bluray-folder":
        // Jellyscale lists the folder's .m2ts as a plain film named 00000, not as a disc, with VideoType VideoFile
        // and a Path under BDMV/STREAM. The core's disc-path rule (source-acceptance.ts rule 4) sends the forced
        // request, and Jellyscale offers no conversion, so the core refuses. Observed in T2-09 milestone 1.
        return { kind: "refused", reason: "disc-source" };
      case "sidecar-srt":
        // The sidecar's DeliveryUrl is fetched with the header and answers 200: the proof that Jellyscale's subtitle
        // route works with the header alone (T2-08 item 4).
        return { kind: "direct-play", externalSubtitle: true };
      case "iso":
        // Jellyscale lists no item for the ISO. Observed in T2-09 milestone 1; checkPrecondition keeps it honest.
        return { kind: "not-run", reason: "Jellyscale lists no item for the ISO", precondition: "not-listed" };
      case "h264-limited":
        // The positive control: Jellyscale converts for a bitrate cap, so a conversion here shows its job oracle sees jobs.
        return { kind: "conversion", methods: ["Transcode"], reasonsAnyOf: ["ContainerBitrateExceedsLimit"] };
      default:
        return DIRECT;
    }
  }
  switch (sample) {
    // Jellyfin never direct plays disc folders (StreamBuilder) and ignores Static=true for them
    // (VideosController.GetVideoStream). The server sends no TranscodeReasons for this folder on 10.11.7, so the
    // reason checked is the indicator's, which falls back to "the server needs to convert this file".
    case "bluray-folder":
    case "iso":
      return { kind: "conversion", methods: BOTH_METHODS };
    case "h264-limited":
      return { kind: "conversion", methods: ["Transcode"], reasonsAnyOf: ["ContainerBitrateExceedsLimit", "VideoBitrateNotSupported"] };
    case "bluray-noconv":
      return { kind: "refused", reason: "conversion-not-allowed" };
    case "sidecar-srt":
      return { kind: "direct-play", externalSubtitle: true };
    default:
      return DIRECT;
  }
}

export function expectationFor(serverName: string, set: CapabilitySetName, sampleName: string): Expectation {
  const kind = kindOf(serverName);
  if (!SAMPLES.some((sample) => sample.name === sampleName)) throw new Error(`unknown sample ${sampleName}`);
  const setting = CAPABILITY_SETS[set];
  if (setting.samples !== "all" && !setting.samples.includes(sampleName)) throw new Error(`capability set ${set} does not run ${sampleName}`);
  if (set === "full") return fullExpectation(kind, sampleName);
  const sample = SAMPLES.find((candidate) => candidate.name === sampleName)!;
  if (sample.videoCodec !== setting.lacks) return DIRECT;
  return kind === "jellyscale" ? JELLYSCALE_FORCED_CONVERSION : { kind: "conversion", methods: ["Transcode"], clientReason: "DeviceCannotPlay" };
}

export interface PlanRow {
  server: ServerName;
  set: CapabilitySetName;
  sample: string;
  expect: Expectation;
}

// Every row the run makes: the full set for every sample, then each lacking set's two samples, on every server.
export function runPlan(optIn: boolean): PlanRow[] {
  const rows: PlanRow[] = [];
  for (const server of SERVERS) {
    for (const set of Object.keys(CAPABILITY_SETS) as CapabilitySetName[]) {
      const setting = CAPABILITY_SETS[set];
      for (const sample of SAMPLES) {
        if (sample.optIn && !optIn) continue;
        if (setting.samples !== "all" && !setting.samples.includes(sample.name)) continue;
        rows.push({ server: server.name, set, sample: sample.name, expect: expectationFor(server.name, set, sample.name) });
      }
    }
  }
  return rows;
}
