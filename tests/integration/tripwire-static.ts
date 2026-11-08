// Plays a static (DirectPlay) plan the way libmpv reads the original file:
// ranged reads of the Static=true URL and each external subtitle between the
// start and stopped reports. Every request must pass checkMediaRequest.
import type { PlaybackPlan } from "../../src/domain/playback";
import type { JellyfinGateway } from "../../src/lib/jellyfin/gateway";
import { sleep } from "./tripwire-container";
import { snapshot } from "./tripwire-hls";
import { fail, safeUrl, type MediaRequestLog, type SampleResult } from "./tripwire-report";
import { checkMediaRequest } from "./tripwire-rules";

const MIB = 1024 * 1024;
const PLAYBACK_HOLD_MS = 1500;

// The instrumented player fetch: checks and records every media request.
async function mediaFetch(result: SampleResult, rawUrl: string, range?: string): Promise<Response | undefined> {
  const check = checkMediaRequest(rawUrl);
  const entry: MediaRequestLog = { url: safeUrl(rawUrl), range, check: check.ok ? `ok (${check.kind})` : `FAIL: ${check.reason}` };
  result.mediaRequests.push(entry);
  if (!check.ok) {
    fail(result, "I2", `media request ${entry.url}: ${check.reason}`);
    return undefined;
  }
  // A player follows redirects, so a redirect could lead to a transcode URL.
  // Media requests must be answered directly.
  const response = await fetch(rawUrl, { headers: range ? { Range: range } : {}, redirect: "manual" });
  const body = new Uint8Array(await response.arrayBuffer());
  entry.status = response.status;
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    const target = location ? safeUrl(new URL(location, rawUrl).toString()) : "no Location header";
    fail(result, "I2", `media request ${entry.url} was redirected (${response.status}) to ${target}`);
    return undefined;
  }
  entry.contentType = response.headers.get("content-type") ?? undefined;
  entry.contentRange = response.headers.get("content-range") ?? undefined;
  entry.bytes = body.byteLength;
  const expected = range ? 206 : 200;
  if (response.status !== expected) {
    fail(result, "playback", `media request ${entry.url} (${range ?? "no range"}) returned ${response.status}, expected ${expected}`);
  }
  if (/mpegurl/i.test(entry.contentType ?? "")) {
    fail(result, "I2", `media request ${entry.url} returned an HLS playlist (${entry.contentType})`);
  }
  return response;
}

// Ranged reads of the static URL and each external subtitle, as libmpv makes
// them, between the start and stopped reports.
export async function playStatic(gateway: JellyfinGateway, result: SampleResult, plan: PlaybackPlan, externalSubtitleExpected: boolean): Promise<void> {
  const externalSubtitles = plan.tracks.filter((track) => track.type === "Subtitle" && track.external && track.deliveryUrl);
  result.plan!.externalSubtitles = externalSubtitles.length;
  await gateway.reportStart(plan, snapshot(0));
  const first = await mediaFetch(result, plan.streamUrl, `bytes=0-${MIB - 1}`);
  const total = Number(first?.headers.get("content-range")?.split("/")[1]);
  if (Number.isFinite(total) && total > 2 * MIB) {
    const middle = Math.floor(total / 2);
    await mediaFetch(result, plan.streamUrl, `bytes=${middle}-${middle + MIB - 1}`);
  }
  await mediaFetch(result, plan.streamUrl, "bytes=-65536");
  for (const track of externalSubtitles) await mediaFetch(result, track.deliveryUrl!);
  if (externalSubtitleExpected) {
    const fetched = result.mediaRequests.some((request) => request.check === "ok (subtitle)" && request.status === 200);
    if (externalSubtitles.length === 0) fail(result, "playback", "expected an external subtitle DeliveryUrl in the plan, found none");
    else if (!fetched) fail(result, "playback", "the external subtitle request did not pass the I2 rule with HTTP 200");
  }
  await gateway.reportProgress(plan, snapshot(5));
  await sleep(PLAYBACK_HOLD_MS);
  await gateway.reportProgress(plan, snapshot(6, true));
  await gateway.reportStopped(plan, snapshot(10));
}
