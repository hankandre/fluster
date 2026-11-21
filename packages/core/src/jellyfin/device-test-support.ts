// Test support for the T2-07 files: fixture loading, a queue transport, capability lists and a negotiation helper.
// Ordinary source that is imported by tests only, in the style of jellyfin/fake-transport.ts: it imports no test
// library and no adapter, and reads no host global, so it passes the checks every core source file passes.
import type { LibraryItem } from "../domain/catalog";
import type { AudioCodec, PassthroughFormat, PlayerCapabilities, VideoCodec } from "../domain/player-engine";
import type { Crypto } from "../ports/crypto";
import type { SignInRequest, SignInResult, Transport, TransportRequest, TransportResponse } from "../ports/transport";
import type { StreamingLimitStore } from "../streaming-limits";
import { JellyfinGateway } from "./gateway";
import type { PlaybackInfoResponse } from "./types";
import oldConversionAv1 from "../../tests/fixtures/jellyfin/10.11.7/conversion-av1.json";
import oldConversionH264 from "../../tests/fixtures/jellyfin/10.11.7/conversion-h264.json";
import oldConversionH264ForceFallback from "../../tests/fixtures/jellyfin/10.11.7/conversion-h264-force-fallback.json";
import oldConversionH264Limited from "../../tests/fixtures/jellyfin/10.11.7/conversion-h264-limited.json";
import oldConversionH264LimitedNoConversionUser from "../../tests/fixtures/jellyfin/10.11.7/conversion-h264-limited-no-conversion-user.json";
import oldConversionH264NoConversionUser from "../../tests/fixtures/jellyfin/10.11.7/conversion-h264-no-conversion-user.json";
import oldConversionHevcHdr10 from "../../tests/fixtures/jellyfin/10.11.7/conversion-hevc-hdr10.json";
import oldConversionIso from "../../tests/fixtures/jellyfin/10.11.7/conversion-iso.json";
import oldConversionIsoForceFallback from "../../tests/fixtures/jellyfin/10.11.7/conversion-iso-force-fallback.json";
import oldConversionMultitrack from "../../tests/fixtures/jellyfin/10.11.7/conversion-multitrack.json";
import oldConversionMultitrackAudioPick from "../../tests/fixtures/jellyfin/10.11.7/conversion-multitrack-audio-pick.json";
import oldConversionVersions from "../../tests/fixtures/jellyfin/10.11.7/conversion-versions.json";
import oldDeviceConversionH264 from "../../tests/fixtures/jellyfin/10.11.7/device-conversion-h264.json";
import oldDeviceConversionHevcHdr10 from "../../tests/fixtures/jellyfin/10.11.7/device-conversion-hevc-hdr10.json";
import oldDeviceConversionMultitrackAudio from "../../tests/fixtures/jellyfin/10.11.7/device-conversion-multitrack-audio.json";
import newConversionAv1 from "../../tests/fixtures/jellyfin/12.4.0/conversion-av1.json";
import newConversionH264 from "../../tests/fixtures/jellyfin/12.4.0/conversion-h264.json";
import newConversionH264ForceFallback from "../../tests/fixtures/jellyfin/12.4.0/conversion-h264-force-fallback.json";
import newConversionH264Limited from "../../tests/fixtures/jellyfin/12.4.0/conversion-h264-limited.json";
import newConversionH264LimitedNoConversionUser from "../../tests/fixtures/jellyfin/12.4.0/conversion-h264-limited-no-conversion-user.json";
import newConversionH264NoConversionUser from "../../tests/fixtures/jellyfin/12.4.0/conversion-h264-no-conversion-user.json";
import newConversionHevcHdr10 from "../../tests/fixtures/jellyfin/12.4.0/conversion-hevc-hdr10.json";
import newConversionIso from "../../tests/fixtures/jellyfin/12.4.0/conversion-iso.json";
import newConversionIsoForceFallback from "../../tests/fixtures/jellyfin/12.4.0/conversion-iso-force-fallback.json";
import newConversionMultitrack from "../../tests/fixtures/jellyfin/12.4.0/conversion-multitrack.json";
import newConversionMultitrackAudioPick from "../../tests/fixtures/jellyfin/12.4.0/conversion-multitrack-audio-pick.json";
import newConversionVersions from "../../tests/fixtures/jellyfin/12.4.0/conversion-versions.json";
import newDeviceConversionH264 from "../../tests/fixtures/jellyfin/12.4.0/device-conversion-h264.json";
import newDeviceConversionHevcHdr10 from "../../tests/fixtures/jellyfin/12.4.0/device-conversion-hevc-hdr10.json";
import newDeviceConversionMultitrackAudio from "../../tests/fixtures/jellyfin/12.4.0/device-conversion-multitrack-audio.json";

// The recorded answers the T2-07 tests replay, by "<version>/<file name without the extension>". Listed one by one:
// Vite's import.meta.glob is typed for test files only.
const RECORDED: Record<string, unknown> = {
  "10.11.7/conversion-av1": oldConversionAv1,
  "10.11.7/conversion-h264": oldConversionH264,
  "10.11.7/conversion-h264-force-fallback": oldConversionH264ForceFallback,
  "10.11.7/conversion-h264-limited": oldConversionH264Limited,
  "10.11.7/conversion-h264-limited-no-conversion-user": oldConversionH264LimitedNoConversionUser,
  "10.11.7/conversion-h264-no-conversion-user": oldConversionH264NoConversionUser,
  "10.11.7/conversion-hevc-hdr10": oldConversionHevcHdr10,
  "10.11.7/conversion-iso": oldConversionIso,
  "10.11.7/conversion-iso-force-fallback": oldConversionIsoForceFallback,
  "10.11.7/conversion-multitrack": oldConversionMultitrack,
  "10.11.7/conversion-multitrack-audio-pick": oldConversionMultitrackAudioPick,
  "10.11.7/conversion-versions": oldConversionVersions,
  "10.11.7/device-conversion-h264": oldDeviceConversionH264,
  "10.11.7/device-conversion-hevc-hdr10": oldDeviceConversionHevcHdr10,
  "10.11.7/device-conversion-multitrack-audio": oldDeviceConversionMultitrackAudio,
  "12.4.0/conversion-av1": newConversionAv1,
  "12.4.0/conversion-h264": newConversionH264,
  "12.4.0/conversion-h264-force-fallback": newConversionH264ForceFallback,
  "12.4.0/conversion-h264-limited": newConversionH264Limited,
  "12.4.0/conversion-h264-limited-no-conversion-user": newConversionH264LimitedNoConversionUser,
  "12.4.0/conversion-h264-no-conversion-user": newConversionH264NoConversionUser,
  "12.4.0/conversion-hevc-hdr10": newConversionHevcHdr10,
  "12.4.0/conversion-iso": newConversionIso,
  "12.4.0/conversion-iso-force-fallback": newConversionIsoForceFallback,
  "12.4.0/conversion-multitrack": newConversionMultitrack,
  "12.4.0/conversion-multitrack-audio-pick": newConversionMultitrackAudioPick,
  "12.4.0/conversion-versions": newConversionVersions,
  "12.4.0/device-conversion-h264": newDeviceConversionH264,
  "12.4.0/device-conversion-hevc-hdr10": newDeviceConversionHevcHdr10,
  "12.4.0/device-conversion-multitrack-audio": newDeviceConversionMultitrackAudio,
};

// A fixed Crypto for the gateway under test: core code outside the adapters never imports the reference adapter
// (DOMAINS.md, dependency rule 4). No T2-07 test reads the device id.
const testCrypto: Crypto = {
  sha256Hex: async () => "device-id-1",
  randomId: () => "install-1",
};

function copyOf<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const VERSIONS = ["10.11.7", "12.4.0"] as const;
export const SERVER = "http://127.0.0.1:8096";

// A recorded answer by file name without the extension, for example "conversion-h264" or "device-conversion-h264".
export function recorded(version: string, name: string): PlaybackInfoResponse {
  const answer = RECORDED[`${version}/${name}`];
  if (answer === undefined) throw new Error(`missing fixture ${version}/${name}`);
  return copyOf(answer as PlaybackInfoResponse);
}

export interface Post {
  url: string;
  data: Record<string, unknown>;
  query: readonly (readonly [string, string])[];
}

// Answers PlaybackInfo requests in order; the last answer repeats.
export class QueueTransport implements Transport {
  posts: Post[] = [];

  constructor(private readonly answers: PlaybackInfoResponse[]) {}

  async signIn(_request: SignInRequest): Promise<SignInResult> {
    return { session: "session-1", userId: "user-test", userName: "tester" };
  }

  async endSession(): Promise<void> {}

  async request(request: TransportRequest): Promise<TransportResponse> {
    if (request.method !== "POST") throw new Error(`unexpected ${request.method}`);
    this.posts.push({ url: request.path, data: request.body as Record<string, unknown>, query: request.query ?? [] });
    const answer = this.answers[Math.min(this.posts.length - 1, this.answers.length - 1)];
    return { status: 200, body: copyOf(answer) };
  }
}

// A complete capability list: each listed codec decodes with no profile or size limit.
export function listOf(video: readonly VideoCodec[], audio: readonly AudioCodec[], passthrough: readonly PassthroughFormat[] = []): PlayerCapabilities {
  return {
    probe: "complete",
    videoDecoders: video.map((codec) => ({ codec, hardware: true })),
    audioDecoders: [...audio],
    hdr: [],
    passthrough: [...passthrough],
  };
}

export const EVERYTHING = listOf(["h264", "hevc", "av1", "vp9"], ["aac", "ac3", "eac3", "opus", "flac", "mp3"]);
export const FAILED: PlayerCapabilities = { probe: "failed" };
export const withoutH264 = listOf(["hevc", "av1"], ["aac", "ac3"]);
export const withoutHevc = listOf(["h264", "av1"], ["aac", "ac3"]);
export const withoutAac = listOf(["h264", "hevc", "av1"], ["ac3"]);
export const withoutAc3 = listOf(["h264", "hevc", "av1"], ["aac"]);

export interface NegotiateOptions {
  mediaSourceId?: string;
  options?: { audioStreamIndex?: number; subtitleStreamIndex?: number; keepDirectPlay?: boolean };
  limits?: StreamingLimitStore;
  server?: string;
}

// Signs in to a gateway with the given capability source (none when `capabilities` is undefined), asks for one
// plan, and returns the requests and the plan or the error.
export async function negotiate(itemId: string, answers: PlaybackInfoResponse[], capabilities: PlayerCapabilities | "full" | undefined, extra: NegotiateOptions = {}) {
  const transport = new QueueTransport(answers);
  const source = capabilities === undefined ? undefined : { get: () => capabilities };
  const gateway = new JellyfinGateway(extra.server ?? SERVER, testCrypto, transport, "install-1", undefined, extra.limits, source as never);
  await gateway.login("tester", "password");
  const item: LibraryItem = { id: itemId, name: "Fixture", type: "Movie", resumePositionTicks: 0, played: false };
  const result = await gateway.createPlaybackPlan(item, 0, undefined, extra.mediaSourceId, extra.options).catch((error: unknown) => error);
  return { transport, result };
}

// The answer to a forced request, as a server that would answer with a different play session: the answer and the
// URL both carry it, so a test can tell which answer a plan was built from.
export function withSession(answer: PlaybackInfoResponse, sessionId: string): PlaybackInfoResponse {
  const copy = copyOf(answer);
  copy.PlaySessionId = sessionId;
  for (const source of copy.MediaSources ?? []) {
    if (source.TranscodingUrl) source.TranscodingUrl = source.TranscodingUrl.replace(/PlaySessionId=[^&]*/i, `PlaySessionId=${sessionId}`);
  }
  return copy;
}

export function queryValue(post: Post, name: string): string | undefined {
  return post.query.find(([key]) => key === name)?.[1];
}
