// One tripwire row: negotiate a sample through the real gateway, play it the way a player would, and judge it by the
// server's own oracle. Split out of tripwire.ts for the file-size guide.
import type { LibraryItem } from "../../packages/core/src/domain/catalog";
import { conversionIndicator } from "../../packages/core/src/domain/conversion-copy";
import { PlaybackRefusedError, type PlaybackPlan } from "../../packages/core/src/domain/playback";
import type { JellyfinGateway } from "../../packages/core/src/jellyfin/gateway";
import { classifyJellyscaleFfmpeg } from "./tripwire-jellyscale-ffmpeg";
import { LogWatcher, ProcessMonitor, sleep } from "./tripwire-container";
import { JOB_GONE_DEADLINE_MS, playConversion } from "./tripwire-hls";
import type { CapabilitySetName, SampleDef } from "./tripwire-expectations";
import { jobRowCounts } from "./tripwire-jellyscale";
import {
  checkClientConversion,
  checkConversionPlan,
  checkJobGone,
  checkSessionAgreement,
  decideStatus,
  findTranscodeLogFiles,
  findTranscodeLogLines,
  jobSignals,
  type Expectation,
  type ServerKind,
} from "./tripwire-rules";
import type { ItemDto, MonitorClient, SessionWatcher } from "./tripwire-server";
import { playStatic } from "./tripwire-static";
import { authorizationFor } from "./tripwire-transport";
import type { WireRecord } from "./tripwire-wire";
import { addCredential, addSecret, errorText, fail, safeUrl, scrub, type SampleResult } from "./tripwire-report";

const AFTER_STOP_GRACE_MS = 1500;

export interface ServerContext {
  name: string;
  kind: ServerKind;
  url: string;
  monitor: MonitorClient;
  sessionWatcher: SessionWatcher;
  processes: ProcessMonitor;
  // Jellyfin only: the log is that server's third job signal.
  logs?: LogWatcher;
  // Jellyscale only: whether the gateway can match a session to the plan (set by milestone 1).
  playMethodCheck: "answered" | "unanswered";
  // Every request the run has made so far; a row reads its own slice.
  wire: readonly WireRecord[];
  gatewayFor(sample: SampleDef, set: CapabilitySetName): Promise<JellyfinGateway>;
  jobCount(): Promise<number>;
}

function toLibraryItem(item: ItemDto): LibraryItem {
  return {
    id: item.Id,
    name: item.Name ?? "unknown",
    type: item.Type === "Episode" ? "Episode" : "Movie",
    seriesName: item.SeriesName,
    resumePositionTicks: 0,
    played: false,
  };
}

const PLAYBACK_INFO = /^\/Items\/[^/]+\/PlaybackInfo$/i;

export function countPlaybackInfo(requests: readonly WireRecord[]): number {
  return requests.filter((request) => request.method === "POST" && PLAYBACK_INFO.test(request.path)).length;
}

// The first media source's id and the Jellyfin index of its second audio stream: what the title page sends when the
// viewer picks the second track. Fails the sample unless the plan is a static one for that track. The count of
// PlaybackInfo requests is checked from the wire record by the caller.
async function planWithAudioPick(server: ServerContext, gateway: JellyfinGateway, listed: ItemDto, result: SampleResult): Promise<PlaybackPlan> {
  // Jellyscale's item list carries one audio stream per source; its item detail carries all of them.
  const item = server.kind === "jellyscale" ? ((await server.monitor.request("GET", `/Items/${listed.Id}`)) as ItemDto) : listed;
  const source = (item.MediaSources?.[0] ?? {}) as { Id?: string; MediaStreams?: { Type?: string; Index?: number }[] };
  const audio = (source.MediaStreams ?? []).filter((stream) => stream.Type === "Audio" && typeof stream.Index === "number");
  const audioStreamIndex = audio[1]?.Index;
  if (!source.Id || audioStreamIndex === undefined) throw new Error("the multitrack sample has no second audio stream");
  const plan = await gateway.createPlaybackPlan(toLibraryItem(item), 0, undefined, source.Id, { audioStreamIndex, keepDirectPlay: true });
  if (plan.delivery !== "static") fail(result, "I1", "the audio pick turned a direct play into a conversion");
  else if (plan.defaultAudioStreamIndex !== audioStreamIndex) fail(result, "playback", "the plan does not carry the picked audio track");
  return plan;
}

export function emptyResult(sample: SampleDef, set: CapabilitySetName, expect: Expectation, failure?: string): SampleResult {
  return {
    sample: sample.name,
    capabilities: set,
    path: sample.path,
    status: "FAIL",
    expect,
    user: sample.user ?? "octave-test",
    streamingLimit: sample.limitMbps === undefined ? "no limit" : `${sample.limitMbps} Mbit/s (local)`,
    failures: failure ? [failure] : [],
    notes: [],
    mediaRequests: [],
    playbackInfoRequests: 0,
    jobSignals: [],
    sessions: { polls: 0, sawOurSession: 0, ourPlayMethods: [], transcoding: [], transcodingInfo: [] },
    processPolls: 0,
    ffmpegProcesses: [],
    ffprobeProcesses: [],
    transcodeLogLines: [],
    transcodeLogFiles: [],
    durationMs: 0,
  };
}

export async function playSample(server: ServerContext, sample: SampleDef, set: CapabilitySetName, expect: Expectation, item: ItemDto): Promise<SampleResult> {
  const startedAt = Date.now();
  const result: SampleResult = { ...emptyResult(sample, set, expect), status: "PASS", videoType: item.VideoType };
  const { sessionWatcher, processes, logs } = server;
  // The row's window on the wire record: sequential rows, so everything after this index is this row's.
  const origin = new URL(server.url).origin;
  const wireStart = server.wire.length;
  const rowRequests = () => server.wire.slice(wireStart).filter((request) => request.origin === origin);
  const jobsBefore = server.kind === "jellyscale" ? await jobRowCounts() : undefined;
  processes.start();
  sessionWatcher.start(item.Id);
  let plan: PlaybackPlan | undefined;
  let hasAudio = false;
  let confirmedAt = 0;
  let confirmedMethod: string | undefined;
  try {
    const gateway = await server.gatewayFor(sample, set);
    try {
      plan = sample.audioPick ? await planWithAudioPick(server, gateway, item, result) : await gateway.createPlaybackPlan(toLibraryItem(item));
    } catch (error) {
      if (!(error instanceof PlaybackRefusedError)) throw error;
      result.refusal = error.reason;
      result.notes.push(`gateway refused (${error.reason}): ${errorText(error)}`);
    }
    result.playbackInfoRequests = countPlaybackInfo(rowRequests());
    // Direct play is one PlaybackInfo request: a second one means the gateway asked for a conversion (I1).
    if (expect.kind === "direct-play" && result.playbackInfoRequests !== 1) {
      fail(result, "I1", `a direct play took ${result.playbackInfoRequests} PlaybackInfo requests, not one`);
    }
    if (expect.kind === "refused" && expect.reason === "device-cannot-play" && result.playbackInfoRequests !== 2) {
      fail(result, "I1", `the cannot-play refusal took ${result.playbackInfoRequests} PlaybackInfo requests, not two`);
    }
    if (plan) {
      addSecret(plan.playSessionId);
      addCredential(/Token="([^"]+)"/.exec(authorizationFor(gateway))?.[1]);
      addCredential(new URL(plan.streamUrl).searchParams.get("api_key") ?? undefined);
      hasAudio = plan.tracks.some((track) => track.type === "Audio");
      result.plan = {
        delivery: plan.delivery,
        playMethod: plan.playMethod,
        mediaSourceId: plan.mediaSourceId,
        streamUrl: safeUrl(plan.streamUrl),
        tracks: plan.tracks.length,
        externalSubtitles: 0,
      };
      if (plan.delivery === "static" && expect.kind === "direct-play") {
        await playStatic(gateway, result, plan, expect.externalSubtitle === true);
      } else if (plan.delivery === "hls" && expect.kind === "conversion") {
        result.conversion = {
          negotiatedMethod: plan.playMethod,
          playMethod: plan.playMethod,
          serverConfirmed: false,
          conversionReasons: [...plan.conversionReasons],
          stoppedReport: "not sent",
          afterStop: [],
        };
        const outcome = await playConversion({
          plan,
          gateway,
          serverUrl: server.url,
          monitor: server.monitor,
          kind: server.kind,
          jobCount: () => server.jobCount(),
          record: (request) => result.mediaRequests.push(request),
          safeUrl,
          fail: (kind, message) => fail(result, kind, scrub(message)),
        });
        // What the viewer sees and the reports say: the plan after the server confirmed copy or encode.
        const shown = outcome.confirmed;
        const indicator = conversionIndicator(shown);
        result.conversion.playMethod = shown.playMethod;
        result.conversion.serverConfirmed = outcome.server !== undefined;
        result.conversion.server = outcome.server;
        result.conversion.conversionReasons = [...shown.conversionReasons];
        result.conversion.indicator = indicator?.chip;
        confirmedAt = outcome.confirmedAt;
        confirmedMethod = shown.playMethod;
        const mustAnswer = server.kind === "jellyfin" || server.playMethodCheck === "answered";
        if (!outcome.server && mustAnswer) fail(result, "oracle", "the server never answered the play-method check within 10 s");
        if (outcome.server && !mustAnswer) fail(result, "oracle", "the play-method check answered, but this server is pinned as unanswered");
        result.failures.push(...checkConversionPlan(
          { playMethod: shown.playMethod, conversionReasons: shown.conversionReasons, indicatorReasons: indicator?.reasons ?? [] },
          expect,
        ));
        if (expect.clientReason !== undefined) {
          result.failures.push(...checkClientConversion({
            delivery: plan.delivery,
            playMethod: shown.playMethod,
            clientReason: shown.delivery === "hls" ? shown.clientConversionReason : undefined,
            chip: indicator?.chip,
            requests: rowRequests(),
          }));
        }
        result.conversion.stoppedReport = outcome.stoppedReport;
        result.conversion.afterStop = outcome.afterStop;
        const gone = checkJobGone(outcome.afterStop, JOB_GONE_DEADLINE_MS);
        result.conversion.jobGoneAfterMs = gone.goneAfterMs;
        result.failures.push(...gone.failures);
      } else {
        result.notes.push(`gateway returned a ${plan.delivery} plan (${plan.playMethod}); not played, because the sample expects ${expect.kind}`);
      }
    }
  } catch (error) {
    fail(result, "playback", `playback error: ${errorText(error)}`);
  }

  if (expect.kind !== "conversion") await sleep(AFTER_STOP_GRACE_MS);
  await processes.stop();
  await sessionWatcher.stop(item.Id);
  result.sessions = {
    polls: sessionWatcher.polls,
    sawOurSession: sessionWatcher.sawOurSession,
    ourPlayMethods: [...sessionWatcher.playMethods],
    transcoding: [...sessionWatcher.transcoding],
    transcodingInfo: [...sessionWatcher.transcodingInfo.values()],
  };
  result.processPolls = processes.polls;
  for (const error of [...processes.errors, ...sessionWatcher.errors]) fail(result, "oracle", scrub(error));
  if (processes.polls === 0) fail(result, "oracle", "no process listing succeeded during playback");
  if (plan && result.mediaRequests.length > 0 && sessionWatcher.sawOurSession === 0) {
    fail(result, "oracle", "the session watcher never saw this playback on /Sessions");
  }
  result.ffmpegProcesses = [...processes.ffmpeg.values()].map(scrub);
  result.ffprobeProcesses = [...processes.ffprobe.values()].map(scrub);
  let transcodeLogLines: string[] = [];
  let transcodeLogFiles: string[] = [];
  if (logs) {
    try {
      const content = await logs.newContent();
      transcodeLogLines = findTranscodeLogLines(content.text).map(scrub);
      transcodeLogFiles = findTranscodeLogFiles(content.newFiles);
    } catch (error) {
      fail(result, "oracle", `reading the Jellyfin log failed: ${errorText(error)}`);
    }
  }
  result.transcodeLogLines = transcodeLogLines;
  result.transcodeLogFiles = transcodeLogFiles;
  let newJobRows = 0;
  if (jobsBefore) {
    try {
      newJobRows = (await jobRowCounts()).total - jobsBefore.total;
      result.newJobRows = newJobRows;
    } catch (error) {
      fail(result, "oracle", `reading transcode_jobs failed: ${errorText(error)}`);
    }
  }
  const sessionsWithJob = sessionWatcher.transcoding.length + [...sessionWatcher.playMethods].filter((method) => method !== "DirectPlay").length;
  const transcodeFfmpeg = result.ffmpegProcesses.filter((command) => classifyJellyscaleFfmpeg(command) === "transcode").length;
  result.jobSignals = server.kind === "jellyfin"
    ? jobSignals("jellyfin", { ffmpegProcesses: result.ffmpegProcesses.length, sessionsWithJob, transcodeLogLines: transcodeLogLines.length, transcodeLogFiles: transcodeLogFiles.length })
    : jobSignals("jellyscale", { newJobRows, sessionsWithJob, transcodeFfmpegProcesses: transcodeFfmpeg });

  if (expect.kind === "conversion") {
    // A conversion is expected to start a job; /Sessions must agree with the confirmed method from the first
    // report that carried it, and the job must be gone after the stop (checked above).
    // The watcher is independent of the gateway, so it checks the plan's method even where the gateway's own play-method
    // check cannot answer (Jellyscale).
    if (confirmedMethod && result.mediaRequests.length > 0) {
      result.failures.push(...checkSessionAgreement(confirmedMethod, sessionWatcher.observations, hasAudio, confirmedAt));
    }
    // Jellyscale's positive control: a conversion must show a job on every signal that can see one there (the
    // transcode_jobs row and /Sessions; its ffmpeg is too short-lived to catch). Otherwise a "no job" result on that
    // server proves nothing.
    if (server.kind === "jellyscale") {
      for (const signal of ["job-rows", "sessions"]) {
        if (!result.jobSignals.includes(signal)) fail(result, "oracle", `oracle blind: the conversion showed no ${signal} signal on Jellyscale (Jellyscale keeps converted segments, so a rerun on the same fixture starts no job: run pnpm fixture:down first)`);
      }
    }
  } else {
    // Direct play and refusals: no job signal at all.
    for (const session of sessionWatcher.transcoding) {
      const what = session.transcodingInfo !== undefined ? "TranscodingInfo" : `PlayMethod ${session.playMethod}`;
      fail(result, "I1", `/Sessions: session ${session.id} had ${what}`);
    }
    for (const method of sessionWatcher.playMethods) {
      if (method !== "DirectPlay") fail(result, "I1", `/Sessions: this playback reported PlayMethod ${method}`);
    }
    for (const signal of result.jobSignals.filter((name) => name !== "sessions")) fail(result, "I1", `server job signal: ${signal}${signal === "job-rows" ? ` (${newJobRows} new transcode_jobs row(s))` : ""}`);
    for (const command of result.ffmpegProcesses) {
      if (server.kind === "jellyfin" || classifyJellyscaleFfmpeg(command) === "transcode") fail(result, "I1", `ffmpeg process in container: ${command.slice(0, 160)}`);
    }
    for (const line of result.transcodeLogLines) fail(result, "I1", `Jellyfin log transcode line: ${line.slice(0, 200)}`);
    for (const name of result.transcodeLogFiles) fail(result, "I1", `Jellyfin transcode log file: ${name}`);
  }

  const decision = decideStatus({
    expect,
    failures: result.failures,
    mediaRequests: result.mediaRequests.length,
    delivery: plan?.delivery,
    refusal: result.refusal,
  });
  if (decision.extraFailure) result.failures.push(decision.extraFailure);
  result.status = decision.status;
  result.durationMs = Date.now() - startedAt;
  return result;
}
