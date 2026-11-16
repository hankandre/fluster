// Records scrubbed PlaybackInfo contract fixtures from the two fixture servers.
// Conversion fixtures also need FLUSTER_CONVERSION_SAMPLES=1 pnpm samples:generate (dvdsub and ISO).
// Usage: pnpm fixture:up && pnpm fixture:setup && node tests/integration/record-fixtures.mjs [file ...]
// Naming fixture files (for example playbackinfo-av1-profile) records only those;
// the name "conversion" records every conversion-* fixture.
// Credentials come from tests/integration/.credentials and are never printed.
// Scrubbing follows .claude/skills/jellyfin-api/references/contract-fixtures.md.
// Conversion fixtures (P10-02, files named conversion-*) use the decision 0002 profile and flags.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { call, makeSaver, makeScrubber, readCredentials, sleep } from "./fixture-recording.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outRoot = join(here, "..", "fixtures", "jellyfin");

const servers = [
  { name: "jellyfin-10-11", folder: "10.11.7", fakeServerId: "server-1011" },
  { name: "jellyfin-12", folder: "12.4.0", fakeServerId: "server-124" },
];

// Items are found by their path, because metadata matching renames some titles.
const cases = [
  { file: "playbackinfo-h264-no-profile", fakeId: "item-h264", path: "Synthetic H264 (2024).mkv", profile: false },
  { file: "playbackinfo-h264-profile", fakeId: "item-h264", path: "Synthetic H264 (2024).mkv", profile: true },
  { file: "playbackinfo-external-subtitle", fakeId: "item-sidecar", path: "Synthetic Sidecar (2024).mkv", profile: true },
  { file: "playbackinfo-multi-version", fakeId: "item-versions", path: "Synthetic Versions (2024) - 1080p.mkv", profile: true },
  { file: "playbackinfo-bluray-folder", fakeId: "item-bluray", path: "Synthetic BluRay (2024)", profile: true },
  // Codec coverage for the empty-codec DirectPlayProfile assumption (P1-03).
  { file: "playbackinfo-hevc-hdr10-profile", fakeId: "item-hevc", path: "Synthetic HEVC HDR10 (2024).mkv", profile: true },
  { file: "playbackinfo-av1-profile", fakeId: "item-av1", path: "Synthetic AV1 (2024).mkv", profile: true },
  { file: "playbackinfo-ass-profile", fakeId: "item-ass", path: "Synthetic ASS (2024).mkv", profile: true },
  { file: "playbackinfo-multitrack-profile", fakeId: "item-multitrack", path: "Synthetic Multitrack (2024).mkv", profile: true },
  // User-configuration cases (P3-13): the server computes the default indices from the user's settings.
  { file: "playbackinfo-multitrack-prefer-spanish", fakeId: "item-multitrack", path: "Synthetic Multitrack (2024).mkv", profile: true, userConfig: { AudioLanguagePreference: "spa", PlayDefaultAudioTrack: false } },
  { file: "playbackinfo-sidecar-subtitles-none", fakeId: "item-sidecar", path: "Synthetic Sidecar (2024).mkv", profile: true, userConfig: { SubtitleMode: "None" } },
  // Conversion cases (P10-02) are listed in conversionCases below.
];

// Samples recorded under the decision 0002 profile and flags. `kind` is the Jellyfin item type.
const conversionSamples = [
  { name: "h264", fakeId: "item-h264", path: "Synthetic H264 (2024).mkv" },
  { name: "hevc-hdr10", fakeId: "item-hevc", path: "Synthetic HEVC HDR10 (2024).mkv" },
  { name: "av1", fakeId: "item-av1", path: "Synthetic AV1 (2024).mkv" },
  { name: "ass", fakeId: "item-ass", path: "Synthetic ASS (2024).mkv" },
  { name: "sidecar", fakeId: "item-sidecar", path: "Synthetic Sidecar (2024).mkv" },
  { name: "multitrack", fakeId: "item-multitrack", path: "Synthetic Multitrack (2024).mkv" },
  { name: "versions", fakeId: "item-versions", path: "Synthetic Versions (2024) - 1080p.mkv" },
  { name: "bluray-folder", fakeId: "item-bluray", path: "Synthetic BluRay (2024)" },
  { name: "dvdsub", fakeId: "item-dvdsub", path: "Synthetic DVDSub (2024).mkv" },
  { name: "iso", fakeId: "item-iso", path: "Synthetic ISO (2024).iso" },
  { name: "episode-s01e01", fakeId: "item-episode-1", path: "Synthetic Show S01E01.mkv" },
  { name: "episode-s01e02", fakeId: "item-episode-2", path: "Synthetic Show S01E02.mkv" },
  { name: "episode-s00e01", fakeId: "item-episode-0", path: "Synthetic Show S00E01.mkv" },
];
// The H.264 sample is about 491 kbit/s, so 200 kbit/s is below its bitrate.
const LIMITED_BITRATE = 200000;
const sample = (name) => conversionSamples.find((c) => c.name === name);
const conversionCases = [
  ...conversionSamples.map((c) => ({ ...c, file: `conversion-${c.name}` })),
  { ...sample("h264"), file: "conversion-h264-limited", maxStreamingBitrate: LIMITED_BITRATE },
  // Forced fallback: decision 0002 sends a second request with EnableDirectPlay false.
  ...["h264", "hevc-hdr10", "av1", "ass", "sidecar", "multitrack", "bluray-folder", "iso", "dvdsub"].map((name) => ({
    ...sample(name),
    file: `conversion-${name}-force-fallback`,
    enableDirectPlay: false,
  })),
  // A user whose policy disables video transcoding, audio transcoding, and remuxing.
  // P17-08: the multi-audio sample with a viewer's audio pick (index 2 is the second audio stream; 9 names no stream).
  { ...sample("multitrack"), file: "conversion-multitrack-audio-pick", audioStreamIndex: 2, namesSource: true },
  { ...sample("multitrack"), file: "conversion-multitrack-audio-pick-force-fallback", audioStreamIndex: 2, namesSource: true, enableDirectPlay: false },
  { ...sample("multitrack"), file: "conversion-multitrack-audio-pick-missing", audioStreamIndex: 9, namesSource: true },
  { ...sample("bluray-folder"), file: "conversion-bluray-folder-no-conversion-user", restricted: true },
  { ...sample("h264"), file: "conversion-h264-no-conversion-user", restricted: true },
  { ...sample("h264"), file: "conversion-h264-limited-no-conversion-user", restricted: true, maxStreamingBitrate: LIMITED_BITRATE },
];
const allCases = [...cases, ...conversionCases];
const only = new Set(process.argv.slice(2));
// The name "conversion" records every conversion-* fixture and nothing else.
const wanted = (file) => only.size === 0 || only.has(file) || (only.has("conversion") && file.startsWith("conversion-"));

const FLUSTER_PROFILE = {
  Name: "Fluster",
  MaxStreamingBitrate: 1000000000,
  MaxStaticBitrate: 1000000000,
  DirectPlayProfiles: [{ Type: "Video" }, { Type: "Audio" }],
  TranscodingProfiles: [],
  ContainerProfiles: [],
  CodecProfiles: [],
  SubtitleProfiles: [
    ...["srt", "ass", "ssa", "vtt", "sub", "pgssub"].map((Format) => ({ Format, Method: "External" })),
    ...["srt", "ass", "ssa", "pgssub", "dvdsub", "vtt"].map((Format) => ({ Format, Method: "Embed" })),
  ],
};

const FLAGS = {
  EnableDirectPlay: true,
  EnableDirectStream: false,
  EnableTranscoding: false,
  AllowVideoStreamCopy: false,
  AllowAudioStreamCopy: false,
  AutoOpenLiveStream: false,
};

// Decision 0002 profile, docs/decisions/0002-server-transcoding-fallback.md "DeviceProfile":
// DirectPlayProfiles unchanged (match-all); one Video and one Audio HLS TranscodingProfile
// (Container mp4, Protocol hls, Context Streaming; video codecs "proposed h264,hevc,av1,vp9",
// audio "proposed aac,ac3,eac3,opus,flac,mp3", EnableSubtitlesInManifest false; audio aac);
// CodecProfiles and ContainerProfiles empty; SubtitleProfiles unchanged, no Hls method.
// P10-03 owns the production profile; this copy only exists to record fixtures.
const CONVERSION_PROFILE = {
  ...FLUSTER_PROFILE,
  TranscodingProfiles: [
    {
      Type: "Video",
      Container: "mp4",
      Protocol: "hls",
      Context: "Streaming",
      VideoCodec: "h264,hevc,av1,vp9",
      AudioCodec: "aac,ac3,eac3,opus,flac,mp3",
      EnableSubtitlesInManifest: false,
    },
    { Type: "Audio", Container: "mp4", Protocol: "hls", Context: "Streaming", AudioCodec: "aac" },
  ],
};

// Decision 0002 "Negotiation" table. AlwaysBurnInSubtitleWhenTranscoding is a body-only field
// (it is not a PlaybackInfo query parameter in the 10.11.7 and 12.4 OpenAPI documents).
const CONVERSION_FLAGS = {
  EnableDirectPlay: true,
  EnableDirectStream: true,
  EnableTranscoding: true,
  AllowVideoStreamCopy: true,
  AllowAudioStreamCopy: true,
  AutoOpenLiveStream: false,
};

// Refreshes the library and polls until every wanted path is indexed.
async function findItems(base, token) {
  await call(base, token, "POST", "/Library/Refresh");
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const result = await call(base, token, "GET", "/Items", {
      query: { Recursive: true, IncludeItemTypes: "Movie,Video,Episode", Fields: "Path,MediaSources" },
    });
    const items = result.Items ?? [];
    const found = items.length > 0 && allCases.every((c) => items.some((i) => i.Path?.endsWith(c.path)));
    // Both versions must be merged under one movie before the case is useful.
    const versions = items.find((i) => i.Path?.includes("Synthetic Versions"));
    if (found && (versions?.MediaSources?.length ?? 0) >= 2) return items;
    await sleep(2000);
  }
  const missing = allCases.filter((c) => !items.some((i) => i.Path?.endsWith(c.path))).map((c) => c.path);
  const hint = missing.some((m) => /DVDSub|ISO/.test(m)) ? " Conversion fixtures need the dvdsub and ISO samples: run FLUSTER_CONVERSION_SAMPLES=1 pnpm samples:generate first." : "";
  throw new Error(`library scan did not finish; missing: ${missing.join(", ")}.${hint}`);
}

function requestFor(userId, withProfile, mediaSourceId) {
  const body = { ...FLAGS, UserId: userId, StartTimeTicks: 0, MaxStreamingBitrate: 1000000000 };
  if (mediaSourceId) body.MediaSourceId = mediaSourceId;
  if (withProfile) body.DeviceProfile = FLUSTER_PROFILE;
  return { body, query: { ...FLAGS, UserId: userId, StartTimeTicks: 0 } };
}

function conversionRequestFor(userId, target, mediaSourceId) {
  const flags = { ...CONVERSION_FLAGS, EnableDirectPlay: target.enableDirectPlay ?? true };
  const maxStreamingBitrate = target.maxStreamingBitrate ?? 1000000000;
  const body = {
    ...flags,
    AlwaysBurnInSubtitleWhenTranscoding: false,
    UserId: userId,
    StartTimeTicks: 0,
    MaxStreamingBitrate: maxStreamingBitrate,
    DeviceProfile: CONVERSION_PROFILE,
  };
  if (mediaSourceId) body.MediaSourceId = mediaSourceId;
  const query = { ...flags, UserId: userId, StartTimeTicks: 0, MaxStreamingBitrate: maxStreamingBitrate };
  // P17-08: a viewer's audio pick goes in the body and the query, as the gateway sends it.
  if (target.audioStreamIndex !== undefined) {
    body.AudioStreamIndex = target.audioStreamIndex;
    query.AudioStreamIndex = target.audioStreamIndex;
  }
  return { body, query };
}

const credentials = readCredentials();
for (const server of servers) {
  const base = credentials[`${server.name}_url`];
  const auth = await call(base, undefined, "POST", "/Users/AuthenticateByName", {
    body: { Username: credentials[`${server.name}_username`], Pw: credentials[`${server.name}_password`] },
  });
  const token = auth.AccessToken;
  const userId = auth.User.Id;
  // The restricted user (transcoding and remuxing disabled) is created by fixture:setup.
  let restricted;
  if (credentials[`${server.name}_restricted_username`]) {
    const restrictedAuth = await call(base, undefined, "POST", "/Users/AuthenticateByName", {
      body: { Username: credentials[`${server.name}_restricted_username`], Pw: credentials[`${server.name}_restricted_password`] },
    });
    restricted = { token: restrictedAuth.AccessToken, userId: restrictedAuth.User.Id };
  }
  const info = await call(base, undefined, "GET", "/System/Info/Public");
  console.log(`${server.name}: Jellyfin ${info.Version}`);

  const items = await findItems(base, token);
  const knownIds = new Map();
  const targets = allCases.map((c) => {
    const item = items.find((i) => i.Path?.endsWith(c.path));
    knownIds.set(item.Id.toLowerCase(), c.fakeId);
    return { ...c, item };
  });
  // The second version is a media source of the same item; name its id too.
  const versionsItem = targets.find((t) => t.fakeId === "item-versions").item;
  versionsItem.MediaSources.forEach((source, index) => {
    if (!knownIds.has(source.Id.toLowerCase())) knownIds.set(source.Id.toLowerCase(), `source-versions-${index + 1}`);
  });

  const scrub = makeScrubber({
    tokens: [token, restricted?.token].filter(Boolean),
    host: new URL(base).host,
    fakeUserIds: [
      { real: userId.toLowerCase(), fake: "user-test" },
      ...(restricted ? [{ real: restricted.userId.toLowerCase(), fake: "user-noconv" }] : []),
    ],
    fakeServerId: { real: info.Id.toLowerCase(), fake: server.fakeServerId },
    knownIds,
    serverNames: [info.ServerName].filter(Boolean),
  });

  const outDir = join(outRoot, server.folder);
  mkdirSync(outDir, { recursive: true });
  const save = makeSaver({ outDir, folder: server.folder, scrub, secrets: [token, restricted?.token].filter(Boolean) });

  // userConfig cases change the user's configuration, then restore it.
  const originalConfig = (await call(base, token, "GET", `/Users/${userId}`)).Configuration;
  const setConfig = (config) => call(base, token, "POST", "/Users/Configuration", { query: { userId }, body: config });
  for (const target of targets.filter((t) => wanted(t.file))) {
    if (target.restricted) {
      if (!restricted) throw new Error("fixture:setup did not create the restricted user");
      const request = conversionRequestFor(restricted.userId, target);
      save(target.file, await call(base, restricted.token, "POST", `/Items/${target.item.Id}/PlaybackInfo`, request));
      continue;
    }
    if (target.file.startsWith("conversion-")) {
      const request = conversionRequestFor(userId, target, target.namesSource ? target.item.MediaSources?.[0]?.Id : undefined);
      save(target.file, await call(base, token, "POST", `/Items/${target.item.Id}/PlaybackInfo`, request));
      continue;
    }
    const { body, query } = requestFor(userId, target.profile);
    try {
      if (target.userConfig) await setConfig({ ...originalConfig, ...target.userConfig });
      const response = await call(base, token, "POST", `/Items/${target.item.Id}/PlaybackInfo`, { query, body });
      save(target.file, response);
    } finally {
      if (target.userConfig) {
        await setConfig(originalConfig).catch((error) => {
          console.error(`  could not restore the user configuration after ${target.file}`);
          throw error;
        });
      }
    }
  }
  // The detail view's request: userId only, no fields parameter.
  for (const [file, fakeId, userConfig] of [
    ["item-detail-no-fields-multi-version", "item-versions"],
    ["item-detail-no-fields-hevc-hdr10", "item-hevc"],
    // P17-08: the multi-audio item, then again under a Spanish audio preference.
    ["item-detail-no-fields-multitrack", "item-multitrack"],
    ["item-detail-no-fields-multitrack-prefer-spanish", "item-multitrack", { AudioLanguagePreference: "spa", PlayDefaultAudioTrack: false }],
  ]) {
    if (!wanted(file)) continue;
    const target = targets.find((t) => t.fakeId === fakeId);
    try {
      if (userConfig) await setConfig({ ...originalConfig, ...userConfig });
      save(file, await call(base, token, "GET", `/Items/${target.item.Id}`, { query: { userId } }));
    } finally {
      if (userConfig) {
        await setConfig(originalConfig).catch((error) => {
          console.error(`  could not restore the user configuration after ${file}`);
          throw error;
        });
      }
    }
  }
  if (wanted("item-multi-version")) {
    const detail = await call(base, token, "GET", `/Items/${versionsItem.Id}`, { query: { userId, fields: "MediaSources" } });
    save("item-multi-version", detail);
  }
}
