// Records scrubbed account-language contract fixtures (P17-01) from the two fixture servers.
// Usage: pnpm samples:generate && pnpm fixture:up && pnpm fixture:setup
//        && node tests/integration/record-account-language-fixtures.mjs
// Every change is made on a throwaway non-admin user (octave-languages), never on a fixture user.
// The recorder still snapshots the three fixture users' Configuration first and restores it at the
// end, also after a failed run or SIGINT/SIGTERM. It stages tests/samples/staging/Synthetic Languages
// (2024) into movies/ for its run and removes it again. Never run it against a real server: it
// creates and deletes users. Credentials come from tests/integration/.credentials and are never printed.
// Scrubbing and the leak checks are shared with the other recorders (fixture-recording.mjs).
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { call, callStatus, makeSaver, makeScrubber, readCredentials, sleep } from "./fixture-recording.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outRoot = join(here, "..", "..", "packages", "core", "tests", "fixtures", "jellyfin");
const samplesDir = join(here, "..", "samples");
const stagedFolder = join(samplesDir, "staging", "Synthetic Languages (2024)");
const copiedFolder = join(samplesDir, "movies", "Synthetic Languages (2024)");
const SAMPLE_FILE = "Synthetic Languages (2024).mkv";
const THROWAWAY = "octave-languages";

const servers = [
  { name: "jellyfin-10-11", folder: "10.11.7", fakeServerId: "server-1011" },
  { name: "jellyfin-12", folder: "12.4.0", fakeServerId: "server-124" },
];

// Same profile and flags the gateway sends (copied from record-fixtures.mjs, which does not export them).
const OCTAVE_PROFILE = {
  Name: "Octave",
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
function requestFor(userId) {
  return {
    body: { ...FLAGS, UserId: userId, StartTimeTicks: 0, MaxStreamingBitrate: 1000000000, DeviceProfile: OCTAVE_PROFILE },
    query: { ...FLAGS, UserId: userId, StartTimeTicks: 0 },
  };
}

// Scene C cells: fields overlaid on the new user's Configuration (see docs/specs/P17-01.md).
const cells = [
  ["A1", {}],
  ["A2", { AudioLanguagePreference: "fra", PlayDefaultAudioTrack: true, SubtitleLanguagePreference: "", SubtitleMode: "Default" }],
  ["A3", { AudioLanguagePreference: "fra", PlayDefaultAudioTrack: false, SubtitleLanguagePreference: "", SubtitleMode: "Default" }],
  ["A4", { AudioLanguagePreference: "ger", PlayDefaultAudioTrack: false, SubtitleLanguagePreference: "", SubtitleMode: "Default" }],
  ["A5", { AudioLanguagePreference: "deu", PlayDefaultAudioTrack: false, SubtitleLanguagePreference: "", SubtitleMode: "Default" }],
  ["A6", { AudioLanguagePreference: "OriginalLanguage", PlayDefaultAudioTrack: false, SubtitleLanguagePreference: "", SubtitleMode: "Default" }],
  ["A7", { AudioLanguagePreference: "OriginalLanguage", PlayDefaultAudioTrack: true, SubtitleLanguagePreference: "", SubtitleMode: "Default" }],
  ["S1", { AudioLanguagePreference: "eng", PlayDefaultAudioTrack: true, SubtitleLanguagePreference: "fra", SubtitleMode: "Default" }],
  ["S2", { AudioLanguagePreference: "eng", PlayDefaultAudioTrack: true, SubtitleLanguagePreference: "fra", SubtitleMode: "Always" }],
  ["S3", { AudioLanguagePreference: "eng", PlayDefaultAudioTrack: true, SubtitleLanguagePreference: "fra", SubtitleMode: "OnlyForced" }],
  ["S4", { AudioLanguagePreference: "eng", PlayDefaultAudioTrack: true, SubtitleLanguagePreference: "fra", SubtitleMode: "None" }],
  ["S5", { AudioLanguagePreference: "eng", PlayDefaultAudioTrack: true, SubtitleLanguagePreference: "fra", SubtitleMode: "Smart" }],
  ["S6", { AudioLanguagePreference: "fra", PlayDefaultAudioTrack: false, SubtitleLanguagePreference: "fra", SubtitleMode: "Smart" }],
  ["S7", { AudioLanguagePreference: "eng", PlayDefaultAudioTrack: true, SubtitleLanguagePreference: "ger", SubtitleMode: "Always" }],
  ["S8", { AudioLanguagePreference: "eng", PlayDefaultAudioTrack: true, SubtitleLanguagePreference: "deu", SubtitleMode: "Always" }],
];
const cellKeys = ["AudioLanguagePreference", "PlayDefaultAudioTrack", "SubtitleLanguagePreference", "SubtitleMode"];

const credentials = readCredentials();

async function login(base, username, password) {
  const auth = await call(base, undefined, "POST", "/Users/AuthenticateByName", { body: { Username: username, Pw: password } });
  return { token: auth.AccessToken, userId: auth.User.Id };
}

async function waitFor(what, check, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(2000);
  }
}

// Key order does not matter when comparing two Configuration objects.
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

// ---- Connections: log in, snapshot the fixture users, remove leftovers of a killed run ----------
const conns = [];
const failures = [];
let stagedByThisRun = false;

const fixtureUserKeys = [
  ["octave-test", ""],
  ["octave-noconv", "_restricted"],
  ["octave-discovery", "_discovery"],
];

async function adminItemsByPath(conn) {
  const items = (await call(conn.base, conn.admin.token, "GET", "/Items", {
    query: { userId: conn.admin.userId, recursive: true, includeItemTypes: "Movie", fields: "Path" },
  })).Items ?? [];
  return items.find((i) => i.Path?.endsWith(SAMPLE_FILE));
}

async function connect(server) {
  const base = credentials[`${server.name}_url`];
  const admin = await login(base, credentials[`${server.name}_username`], credentials[`${server.name}_password`]);
  const conn = { server, base, admin, fixtureUsers: [], info: await call(base, undefined, "GET", "/System/Info/Public") };
  console.log(`${server.name}: Jellyfin ${conn.info.Version}`);
  conns.push(conn);
  for (const [userName, infix] of fixtureUserKeys) {
    const username = credentials[`${server.name}${infix}_username`];
    const password = credentials[`${server.name}${infix}_password`];
    if (!username || !password) throw new Error(`${server.name}: fixture user ${userName} is missing; run pnpm fixture:setup`);
    // octave-test is the admin: a second login on the same device would end the admin's token.
    const session = userName === "octave-test" ? admin : await login(base, username, password);
    const me = await call(base, session.token, "GET", "/Users/Me");
    conn.fixtureUsers.push({ userName, token: session.token, userId: session.userId, snapshot: me.Configuration });
  }
  // A killed run leaves its throwaway user behind.
  const users = await call(base, admin.token, "GET", "/Users");
  for (const user of users.filter((u) => u.Name === THROWAWAY)) {
    await call(base, admin.token, "DELETE", `/Users/${user.Id}`);
    console.log(`  removed a leftover ${THROWAWAY} user`);
  }
  return conn;
}

const refreshAll = () => Promise.all(conns.map((c) => call(c.base, c.admin.token, "POST", "/Library/Refresh")));

async function removeStagedCopy() {
  rmSync(copiedFolder, { recursive: true, force: true });
  await refreshAll();
  for (const conn of conns) await waitFor(`the language sample to leave ${conn.server.name}`, async () => !(await adminItemsByPath(conn)));
}

// Runs once, from finally and from the signal handlers. Every step runs even if an earlier one failed.
let cleaned = false;
let interrupted = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  const attempt = async (what, fn) => {
    try {
      await fn();
    } catch (error) {
      failures.push(`${what}: ${error instanceof Error ? error.message : "failed"}`);
    }
  };
  for (const conn of conns) {
    const name = conn.server.name;
    for (const user of conn.fixtureUsers) {
      await attempt(`${name} restore ${user.userName}`, async () => {
        const read = async () => (await call(conn.base, user.token, "GET", "/Users/Me")).Configuration;
        if (canonical(await read()) === canonical(user.snapshot)) return;
        await call(conn.base, user.token, "POST", "/Users/Configuration", { body: user.snapshot });
        if (canonical(await read()) !== canonical(user.snapshot)) throw new Error("Configuration still differs after the restore");
      });
    }
    await attempt(`${name} delete ${THROWAWAY}`, async () => {
      const users = await call(conn.base, conn.admin.token, "GET", "/Users");
      for (const user of users.filter((u) => u.Name === THROWAWAY)) await call(conn.base, conn.admin.token, "DELETE", `/Users/${user.Id}`);
      const left = (await call(conn.base, conn.admin.token, "GET", "/Users")).some((u) => u.Name === THROWAWAY);
      if (left) throw new Error("throwaway user still exists");
    });
  }
  if (stagedByThisRun || existsSync(copiedFolder)) await attempt("remove the staged language sample", removeStagedCopy);
  if (failures.length) {
    console.error(`clean-up failed:\n  ${failures.join("\n  ")}`);
    process.exitCode = 1;
  } else {
    console.log("clean-up done: fixture users restored, throwaway user deleted, language sample removed");
  }
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    interrupted = true;
    console.error(`${signal}: cleaning up`);
    cleanup().finally(() => process.exit(1));
  });
}

// ---- Scenes ------------------------------------------------------------------------------------
async function record(conn) {
  const { server, base, info } = conn;
  const name = `${THROWAWAY}`;
  const password = randomBytes(24).toString("base64url");
  await call(base, conn.admin.token, "POST", "/Users/New", { body: { Name: name, Password: password } });
  const me = await login(base, name, password);
  const userId = me.userId;
  const secrets = [conn.admin.token, ...conn.fixtureUsers.map((u) => u.token), me.token];

  const asMe = (method, path, opts = {}) => call(base, me.token, method, path, opts);
  const asMeStatus = (method, path, opts = {}) => callStatus(base, me.token, method, path, opts);
  const readConfiguration = async () => (await asMe("GET", "/Users/Me")).Configuration;

  const item = await waitFor("the language sample and its streams", async () => {
    const items = (await asMe("GET", "/Items", { query: { userId, recursive: true, includeItemTypes: "Movie", fields: "Path,MediaSources" } })).Items ?? [];
    const found = items.find((i) => i.Path?.endsWith(SAMPLE_FILE));
    const streams = found?.MediaSources?.[0]?.MediaStreams ?? [];
    const count = (type) => streams.filter((s) => s.Type === type).length;
    return count("Video") === 1 && count("Audio") === 4 && count("Subtitle") === 12 ? found : undefined;
  });
  const knownIds = new Map([[item.Id.toLowerCase(), "item-languages"]]);
  if (item.MediaSources[0].Id) knownIds.set(item.MediaSources[0].Id.toLowerCase(), "item-languages");
  const fakeUserIds = [
    { real: userId.toLowerCase(), fake: "user-languages" },
    { real: conn.admin.userId.toLowerCase(), fake: "user-test" },
    ...conn.fixtureUsers
      .filter((u) => u.userName !== "octave-test")
      .map((u) => ({ real: u.userId.toLowerCase(), fake: u.userName === "octave-noconv" ? "user-noconv" : "user-discovery" })),
  ];
  const outDir = join(outRoot, server.folder);
  mkdirSync(outDir, { recursive: true });
  const save = makeSaver({
    outDir,
    folder: server.folder,
    scrub: makeScrubber({
      tokens: secrets,
      host: new URL(base).host,
      fakeUserIds,
      fakeServerId: { real: info.Id.toLowerCase(), fake: server.fakeServerId },
      knownIds,
      serverNames: [info.ServerName].filter(Boolean),
    }),
    secrets,
  });

  // Scene A: read-only, before any write.
  const newConfiguration = await readConfiguration();
  const cultures = await asMe("GET", "/Localization/Cultures");
  const probe = await asMeStatus("GET", "/jellyscale/v1/track-preferences");
  save("account-language-users-me-new-user", { Configuration: newConfiguration });
  save("account-language-cultures", cultures);
  save("account-language-jellyscale-probe", { httpStatus: probe.status });

  // Scene B: the configuration sequence.
  const steps = [];
  const postStep = async (label, body, query) => {
    const result = await asMeStatus("POST", "/Users/Configuration", { body, query });
    const configuration = await readConfiguration();
    steps.push({ step: label, request: { method: "POST", path: "/Users/Configuration", query: query ?? {}, body }, status: result.status, configuration });
    return { status: result.status, configuration };
  };
  const runSequence = async (query, suffix) => {
    const changed = {
      ...newConfiguration,
      AudioLanguagePreference: "eng",
      SubtitleLanguagePreference: "eng",
      PlayDefaultAudioTrack: false,
      SubtitleMode: "Always",
      DisplayMissingEpisodes: true,
      HidePlayedInLatest: false,
      RememberAudioSelections: false,
      RememberSubtitleSelections: false,
      EnableNextEpisodeAutoPlay: false,
    };
    const first = await postStep(`non-language fields changed${suffix}`, changed, query);
    if (first.status < 200 || first.status >= 300) return false;
    const second = await postStep(`whole object, two language fields changed${suffix}`, { ...first.configuration, AudioLanguagePreference: "deu", SubtitleLanguagePreference: "fra" }, query);
    await postStep(`only the language fields${suffix}`, { AudioLanguagePreference: "spa", SubtitleLanguagePreference: "ita" }, query);
    const restored = await postStep(`whole object restored${suffix}`, second.configuration, query);
    await postStep(
      `whole object plus an unknown field${suffix}`,
      { ...restored.configuration, SubtitleLanguagePreference: "spa", OctaveUnknownField: "fixture" },
      query,
    );
    return true;
  };
  // If the caller form is refused, also record the ?userId= form so the merge or reset still shows.
  if (!(await runSequence(undefined, ""))) {
    console.log("  POST /Users/Configuration without userId was refused; recording the ?userId= form too");
    await runSequence({ userId }, " (?userId= form)");
  }
  save("account-language-configuration-sequence", { steps });

  // Scene C: default tracks. Each cell starts from the new user's Configuration.
  const results = [];
  let sample;
  for (const [cell, fields] of cells) {
    const body = { ...newConfiguration, ...fields };
    const saved = await asMeStatus("POST", "/Users/Configuration", { body });
    const read = await readConfiguration();
    const readBack = Object.fromEntries(cellKeys.map((k) => [k, k in read ? read[k] : "absent"]));
    const entry = { cell, fields, saveStatus: saved.status, readBack };
    if (saved.status >= 200 && saved.status < 300) {
      const request = requestFor(userId);
      const info = await callStatus(base, me.token, "POST", `/Items/${item.Id}/PlaybackInfo`, request);
      if (info.status !== 200) throw new Error(`PlaybackInfo for cell ${cell} answered ${info.status}`);
      const source = info.data.MediaSources[0];
      entry.defaultAudioStreamIndex = "DefaultAudioStreamIndex" in source ? source.DefaultAudioStreamIndex : "absent";
      entry.defaultSubtitleStreamIndex = "DefaultSubtitleStreamIndex" in source ? source.DefaultSubtitleStreamIndex : "absent";
      if (cell === "A1") sample = info.data;
    } else {
      entry.playbackInfo = "not requested";
    }
    results.push(entry);
  }
  save("account-language-defaults", { item: "item-languages", cells: results });
  save("account-language-playbackinfo-sample", sample);
}

try {
  for (const server of servers) await connect(server);
  // Stage once: both servers read the same movies/ directory.
  if (existsSync(copiedFolder)) await removeStagedCopy();
  cpSync(stagedFolder, copiedFolder, { recursive: true });
  stagedByThisRun = true;
  await refreshAll();
  for (const conn of conns) await record(conn);
} catch (error) {
  // After a signal the clean-up removes the user the scene is using, so its error is not a finding.
  if (!interrupted) failures.push(`recording: ${error instanceof Error ? error.message : "failed"}`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
if (failures.length) {
  console.error(`failed:\n  ${failures.join("\n  ")}`);
  process.exitCode = 1;
}
