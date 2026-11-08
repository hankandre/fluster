// Records scrubbed PlaybackInfo contract fixtures from the two fixture servers.
// Usage: pnpm fixture:up && pnpm fixture:setup && node tests/integration/record-fixtures.mjs [file ...]
// Naming fixture files (for example playbackinfo-av1-profile) records only those.
// Credentials come from tests/integration/.credentials and are never printed.
// Scrubbing follows .claude/skills/jellyfin-api/references/contract-fixtures.md.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
];
const only = new Set(process.argv.slice(2));
const wanted = (file) => only.size === 0 || only.has(file);

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

function readCredentials() {
  const values = {};
  for (const line of readFileSync(join(here, ".credentials"), "utf8").split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) values[line.slice(0, at)] = line.slice(at + 1);
  }
  return values;
}

const CLIENT = 'MediaBrowser Client="Fluster Tests", Device="ci", DeviceId="fluster-fixtures", Version="0"';

async function call(base, token, method, path, { query, body } = {}) {
  const url = new URL(base + path);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: token ? `${CLIENT}, Token="${token}"` : CLIENT,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Refreshes the library and polls until every wanted path is indexed.
async function findItems(base, token) {
  await call(base, token, "POST", "/Library/Refresh");
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const result = await call(base, token, "GET", "/Items", {
      query: { Recursive: true, IncludeItemTypes: "Movie,Video", Fields: "Path,MediaSources" },
    });
    const items = result.Items ?? [];
    const found = items.length > 0 && cases.every((c) => items.some((i) => i.Path?.endsWith(c.path)));
    // Both versions must be merged under one movie before the case is useful.
    const versions = items.find((i) => i.Path?.includes("Synthetic Versions"));
    if (found && (versions?.MediaSources?.length ?? 0) >= 2) return items;
    await sleep(2000);
  }
  throw new Error("library scan did not finish");
}

function requestFor(userId, withProfile, mediaSourceId) {
  const body = { ...FLAGS, UserId: userId, StartTimeTicks: 0, MaxStreamingBitrate: 1000000000 };
  if (mediaSourceId) body.MediaSourceId = mediaSourceId;
  if (withProfile) body.DeviceProfile = FLUSTER_PROFILE;
  return { body, query: { ...FLAGS, UserId: userId, StartTimeTicks: 0 } };
}

// Scrubbing. Known ids get readable fake names; every other 32-character hex
// value (tags, ETags, other ids) gets a numbered fake so references line up.
function makeScrubber({ token, host, fakeUserId, fakeServerId, knownIds, serverNames }) {
  const fakes = new Map(knownIds);
  let counter = 0;
  const fake = (value) => {
    if (!fakes.has(value)) fakes.set(value, `id-${(counter += 1)}`);
    return fakes.get(value);
  };
  const scrubText = (text) => {
    let result = text;
    if (token) result = result.split(token).join("REDACTED");
    result = result.replace(/([?&](?:ApiKey|api_key|ApiToken|Token|AccessToken)=)[^&"\s]*/gi, "$1REDACTED");
    result = result.split(host).join("jellyfin.test");
    for (const name of serverNames) result = result.split(name).join("Fixture Server");
    result = result.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, (m) => fake(m.replace(/-/g, "").toLowerCase()));
    return result.replace(/\b[0-9a-f]{32}\b/gi, (m) => fake(m.toLowerCase()));
  };
  // Object keys can hold ids too (ImageBlurHashes is keyed by image tag).
  const walk = (value, key) => {
    if (Array.isArray(value)) return value.map((entry) => walk(entry, key));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [scrubText(k), walk(v, k)]));
    }
    if (typeof value !== "string") return value;
    if (key === "PlaySessionId") return "play-session-1";
    return scrubText(value);
  };
  fakes.set(fakeUserId.real, fakeUserId.fake);
  fakes.set(fakeServerId.real, fakeServerId.fake);
  return (data) => walk(data);
}

const credentials = readCredentials();
for (const server of servers) {
  const base = credentials[`${server.name}_url`];
  const auth = await call(base, undefined, "POST", "/Users/AuthenticateByName", {
    body: { Username: credentials[`${server.name}_username`], Pw: credentials[`${server.name}_password`] },
  });
  const token = auth.AccessToken;
  const userId = auth.User.Id;
  const info = await call(base, undefined, "GET", "/System/Info/Public");
  console.log(`${server.name}: Jellyfin ${info.Version}`);

  const items = await findItems(base, token);
  const knownIds = new Map();
  const targets = cases.map((c) => {
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
    token,
    host: new URL(base).host,
    fakeUserId: { real: userId.toLowerCase(), fake: "user-test" },
    fakeServerId: { real: info.Id.toLowerCase(), fake: server.fakeServerId },
    knownIds,
    serverNames: [info.ServerName].filter(Boolean),
  });

  const outDir = join(outRoot, server.folder);
  mkdirSync(outDir, { recursive: true });
  const save = (file, data) => {
    const text = JSON.stringify(scrub(data), null, 2) + "\n";
    if (text.includes(token)) throw new Error(`token leaked into ${file}`);
    writeFileSync(join(outDir, `${file}.json`), text);
    console.log(`  wrote ${server.folder}/${file}.json`);
  };

  // userConfig cases change the user's configuration, then restore it.
  const originalConfig = (await call(base, token, "GET", `/Users/${userId}`)).Configuration;
  const setConfig = (config) => call(base, token, "POST", "/Users/Configuration", { query: { userId }, body: config });
  for (const target of targets.filter((t) => wanted(t.file))) {
    const { body, query } = requestFor(userId, target.profile);
    if (target.userConfig) await setConfig({ ...originalConfig, ...target.userConfig });
    try {
      const response = await call(base, token, "POST", `/Items/${target.item.Id}/PlaybackInfo`, { query, body });
      save(target.file, response);
    } finally {
      if (target.userConfig) await setConfig(originalConfig);
    }
  }
  // The detail view's request: userId only, no fields parameter.
  for (const [file, fakeId] of [["item-detail-no-fields-multi-version", "item-versions"], ["item-detail-no-fields-hevc-hdr10", "item-hevc"]]) {
    if (!wanted(file)) continue;
    const target = targets.find((t) => t.fakeId === fakeId);
    save(file, await call(base, token, "GET", `/Items/${target.item.Id}`, { query: { userId } }));
  }
  if (wanted("item-multi-version")) {
    const detail = await call(base, token, "GET", `/Items/${versionsItem.Id}`, { query: { userId, fields: "MediaSources" } });
    save("item-multi-version", detail);
  }
}
