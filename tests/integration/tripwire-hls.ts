// Plays a conversion plan the way Fluster's native player does (decision
// 0002, E1-B): Rust fetches the master and every variant playlist with the
// Authorization header, libmpv then fetches the init section and segments
// with the same header, and the coordinator reports start once the file has
// loaded. Every request goes through checkHlsRequest before it is sent, and
// every playlist body through findCredentialInBody.
import type { PlaybackPlan, PlaybackSnapshot } from "../../src/domain/playback";
import type { JellyfinGateway } from "../../src/lib/jellyfin/gateway";
import { countFfmpeg, sleep } from "./tripwire-container";
import { checkHlsRequest, findCredentialInBody, playlistUris, type AfterStopObservation, type FailureKind } from "./tripwire-rules";
import { countTranscodingSessions, type MonitorClient } from "./tripwire-server";

export type HlsPlan = Extract<PlaybackPlan, { delivery: "hls" }>;

export interface HlsRequestLog {
  url: string;
  check: string;
  status?: number;
  contentType?: string;
  bytes?: number;
}

export interface HlsContext {
  plan: HlsPlan;
  gateway: JellyfinGateway;
  serverUrl: string;
  monitor: MonitorClient;
  service: string;
  // Records a request with its URL already made safe for the log.
  record(request: HlsRequestLog): void;
  safeUrl(raw: string): string;
  fail(kind: FailureKind, message: string): void;
}

export interface HlsOutcome {
  // "ok", or what failed and that DELETE /Videos/ActiveEncodings followed.
  stoppedReport: string;
  afterStop: AfterStopObservation[];
}

// PRODUCT.md and the acceptance measure "no job 10 s after the stopped report".
export const JOB_GONE_DEADLINE_MS = 10_000;
const AFTER_STOP_POLL_MS = 1000;
const PLAYBACK_HOLD_MS = 1500;
// Never read more than this from one response; the fixture segments are small.
const MAX_BODY_BYTES = 64 * 1024 * 1024;

export function snapshot(positionSeconds: number, paused = false): PlaybackSnapshot {
  return {
    positionSeconds,
    paused,
    buffering: false,
    volume: 100,
    muted: false,
    tracks: [],
    diagnostics: { decodeMode: "unknown", decodeLabel: "tripwire", droppedFrames: 0 },
  };
}

// One checked, header-authenticated GET. A redirect, a refused URL, or a
// non-200 answer is a failure, and the body is not used.
async function hlsGet(ctx: HlsContext, rawUrl: string): Promise<Uint8Array | undefined> {
  const check = checkHlsRequest(rawUrl, ctx.serverUrl);
  const entry: HlsRequestLog = { url: ctx.safeUrl(rawUrl), check: check.ok ? `ok (${check.kind})` : `FAIL: ${check.reason}` };
  ctx.record(entry);
  if (!check.ok) {
    ctx.fail("I2", `conversion request ${entry.url}: ${check.reason}`);
    return undefined;
  }
  const response = await fetch(rawUrl, { headers: { Authorization: ctx.plan.authorization }, redirect: "manual" });
  const body = new Uint8Array(await response.arrayBuffer());
  entry.status = response.status;
  entry.contentType = response.headers.get("content-type") ?? undefined;
  entry.bytes = body.byteLength;
  if (response.status >= 300 && response.status < 400) {
    ctx.fail("I2", `conversion request ${entry.url} was redirected (${response.status})`);
    return undefined;
  }
  if (response.status !== 200) {
    ctx.fail("playback", `conversion request ${entry.url} returned ${response.status}, expected 200`);
    return undefined;
  }
  if (body.byteLength > MAX_BODY_BYTES) {
    ctx.fail("playback", `conversion request ${entry.url} returned more than ${MAX_BODY_BYTES} bytes`);
    return undefined;
  }
  return body;
}

async function playlist(ctx: HlsContext, rawUrl: string): Promise<string[]> {
  const body = await hlsGet(ctx, rawUrl);
  if (!body) return [];
  const text = new TextDecoder().decode(body);
  const credential = findCredentialInBody(text);
  if (credential) {
    ctx.fail("I2", `playlist ${ctx.safeUrl(rawUrl)} names the credential parameter ${credential}`);
    return [];
  }
  return playlistUris(text).map((uri) => new URL(uri, rawUrl).toString());
}

// Fetches master, variants, the init section and first segment, reports
// start, fetches the rest, reports progress and stop, then watches the server
// until the deadline. Returns what happened after the stop.
export async function playConversion(ctx: HlsContext): Promise<HlsOutcome> {
  const { plan, gateway } = ctx;
  const variants = await playlist(ctx, plan.streamUrl);
  if (variants.length === 0) ctx.fail("playback", "the master playlist named no variant");
  const media: string[] = [];
  for (const variant of variants) media.push(...(await playlist(ctx, variant)));
  if (media.length === 0) ctx.fail("playback", "the variant playlists named no segment");

  // libmpv opens the init section and the first segment before FileLoaded,
  // and the coordinator reports start on FileLoaded.
  const firstReads = Math.min(2, media.length);
  for (const uri of media.slice(0, firstReads)) await hlsGet(ctx, uri);
  await gateway.reportStart(plan, snapshot(0));
  for (const uri of media.slice(firstReads)) await hlsGet(ctx, uri);
  await gateway.reportProgress(plan, snapshot(5));
  await sleep(PLAYBACK_HOLD_MS);
  await gateway.reportProgress(plan, snapshot(6, true));

  // The PlaystateReporter path: a stopped report, and one DELETE
  // /Videos/ActiveEncodings when it fails or times out (P10-07).
  const stoppedAt = Date.now();
  let stoppedReport = "ok";
  try {
    await gateway.reportStopped(plan, snapshot(10));
  } catch (error) {
    stoppedReport = `failed (${error instanceof Error ? error.name : "error"}); DELETE /Videos/ActiveEncodings sent`;
    await gateway.stopActiveEncoding(plan.playSessionId).catch((deleteError: unknown) => {
      stoppedReport += `, and it failed (${deleteError instanceof Error ? deleteError.name : "error"})`;
    });
  }

  const afterStop: AfterStopObservation[] = [];
  while (true) {
    const msAfterStop = Date.now() - stoppedAt;
    try {
      const [ffmpegProcesses, sessionsWithTranscodingInfo] = await Promise.all([countFfmpeg(ctx.service), countTranscodingSessions(ctx.monitor)]);
      afterStop.push({ msAfterStop, ffmpegProcesses, sessionsWithTranscodingInfo });
    } catch (error) {
      ctx.fail("oracle", `server check after the stop failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (msAfterStop >= JOB_GONE_DEADLINE_MS) break;
    await sleep(Math.min(AFTER_STOP_POLL_MS, JOB_GONE_DEADLINE_MS - msAfterStop));
  }
  return { stoppedReport, afterStop };
}
