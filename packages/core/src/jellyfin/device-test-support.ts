// Test support for the T2-07 files: fixture loading, a queue transport, capability lists and a negotiation helper.
// Ordinary source that is imported by tests only.
import type { LibraryItem } from "../domain/catalog";
import type { AudioCodec, PassthroughFormat, PlayerCapabilities, VideoCodec } from "../domain/player-engine";
import { webCrypto } from "../adapters/web-crypto";
import type { SignInRequest, SignInResult, Transport, TransportRequest, TransportResponse } from "../ports/transport";
import type { StreamingLimitStore } from "../streaming-limits";
import { JellyfinGateway } from "./gateway";
import type { PlaybackInfoResponse } from "./types";

const conversionFiles = import.meta.glob("../../tests/fixtures/jellyfin/*/conversion-*.json", { eager: true, import: "default" }) as Record<string, PlaybackInfoResponse>;
const deviceFiles = import.meta.glob("../../tests/fixtures/jellyfin/*/device-conversion-*.json", { eager: true, import: "default" }) as Record<string, PlaybackInfoResponse>;

export const VERSIONS = ["10.11.7", "12.4.0"] as const;
export const SERVER = "http://127.0.0.1:8096";

// A recorded answer by file name without the extension, for example "conversion-h264" or "device-conversion-h264".
export function recorded(version: string, name: string): PlaybackInfoResponse {
  const entry = Object.entries({ ...conversionFiles, ...deviceFiles }).find(([path]) => path.endsWith(`/${version}/${name}.json`));
  if (!entry) throw new Error(`missing fixture ${version}/${name}`);
  return structuredClone(entry[1]);
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
    return { status: 200, body: structuredClone(answer) };
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
  const gateway = new JellyfinGateway(extra.server ?? SERVER, webCrypto, transport, "install-1", undefined, extra.limits, source as never);
  await gateway.login("tester", "password");
  const item: LibraryItem = { id: itemId, name: "Fixture", type: "Movie", resumePositionTicks: 0, played: false };
  const result = await gateway.createPlaybackPlan(item, 0, undefined, extra.mediaSourceId, extra.options).catch((error: unknown) => error);
  return { transport, result };
}

// The answer to a forced request, as a server that would answer with a different play session: the answer and the
// URL both carry it, so a test can tell which answer a plan was built from.
export function withSession(answer: PlaybackInfoResponse, sessionId: string): PlaybackInfoResponse {
  const copy = structuredClone(answer);
  copy.PlaySessionId = sessionId;
  for (const source of copy.MediaSources ?? []) {
    if (source.TranscodingUrl) source.TranscodingUrl = source.TranscodingUrl.replace(/PlaySessionId=[^&]*/i, `PlaySessionId=${sessionId}`);
  }
  return copy;
}

export function queryValue(post: Post, name: string): string | undefined {
  return post.query.find(([key]) => key === name)?.[1];
}
