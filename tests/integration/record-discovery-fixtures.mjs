// Records scrubbed discovery contract fixtures (P16-01) from the two fixture servers.
// Usage: pnpm samples:generate && pnpm fixture:up && pnpm fixture:setup
//        && node tests/integration/record-discovery-fixtures.mjs
// Every scene runs as the octave-discovery user, so the watch state it sets never mixes with
// octave-test. The admin octave-test user is used only for /Library/Refresh and POST /Collections.
// Credentials come from tests/integration/.credentials and are never printed.
// Scrubbing and the leak checks are shared with record-fixtures.mjs (fixture-recording.mjs).
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { call, callStatus, makeSaver, makeScrubber, readCredentials, sleep } from "./fixture-recording.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outRoot = join(here, "..", "fixtures", "jellyfin");
const samplesDir = join(here, "..", "samples");
const stagedFile = join(samplesDir, "staging", "Synthetic Show S01E03.mkv");
const seasonDir = join(samplesDir, "shows", "Synthetic Show", "Season 01");
const copiedFile = join(seasonDir, "Synthetic Show S01E03.mkv");

const servers = [
  { name: "jellyfin-10-11", folder: "10.11.7", fakeServerId: "server-1011" },
  { name: "jellyfin-12", folder: "12.4.0", fakeServerId: "server-124" },
];

// Fixed dates, so a rerun records the same answers.
const OLD = "2026-01-05T12:00:00Z";
const RECENT_1 = "2026-06-01T12:00:00Z";
const RECENT_2 = "2026-06-02T12:00:00Z";
const RECENT_3 = "2026-06-03T12:00:00Z";
const RECENT_4 = "2026-06-03T13:00:00Z";
const CUTOFF_MID = "2026-03-01T00:00:00Z";
const CUTOFF_EARLY = "2025-12-01T00:00:00Z";

// Items are found by their path, because metadata matching renames some titles.
const itemPaths = [
  ["item-h264", "Synthetic H264 (2024).mkv"],
  ["item-av1", "Synthetic AV1 (2024).mkv"],
  ["item-multitrack", "Synthetic Multitrack (2024).mkv"],
  ["item-ass", "Synthetic ASS (2024).mkv"],
  ["item-extras", "Synthetic Extras (2024).mkv"],
  ["item-episode-1", "Synthetic Show S01E01.mkv"],
  ["item-episode-2", "Synthetic Show S01E02.mkv"],
];

// Card-style list parameters, like gateway.ts plus user data (P16-04 must drop watched titles).
const card = {
  fields: "PrimaryImageAspectRatio",
  enableImageTypes: "Primary,Backdrop,Thumb,Logo",
  imageTypeLimit: 1,
  enableUserData: true,
  enableTotalRecordCount: false,
};

const credentials = readCredentials();

async function login(base, username, password) {
  const auth = await call(base, undefined, "POST", "/Users/AuthenticateByName", { body: { Username: username, Pw: password } });
  return { token: auth.AccessToken, userId: auth.User.Id };
}

// Polls until check() returns a truthy value or the timeout passes.
async function waitFor(what, check, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(2000);
  }
}

for (const server of servers) {
  const base = credentials[`${server.name}_url`];
  const admin = await login(base, credentials[`${server.name}_username`], credentials[`${server.name}_password`]);
  if (!credentials[`${server.name}_discovery_username`]) throw new Error("fixture:setup did not create the discovery user");
  const me = await login(base, credentials[`${server.name}_discovery_username`], credentials[`${server.name}_discovery_password`]);
  const userId = me.userId;
  const info = await call(base, undefined, "GET", "/System/Info/Public");
  console.log(`${server.name}: Jellyfin ${info.Version}`);

  const asMe = (method, path, opts = {}) => call(base, me.token, method, path, { ...opts, query: { userId, ...(opts.query ?? {}) } });
  const asMeStatus = (method, path, opts = {}) => callStatus(base, me.token, method, path, { ...opts, query: { userId, ...(opts.query ?? {}) } });
  const refresh = () => call(base, admin.token, "POST", "/Library/Refresh");

  // ---- Lookups -------------------------------------------------------------
  const fakeIds = new Map();
  const nameId = (fake, id) => fakeIds.set(id.toLowerCase(), fake);
  const listItems = async (types) =>
    (await asMe("GET", "/Items", { query: { recursive: true, includeItemTypes: types, fields: "Path,Genres" } })).Items ?? [];
  await refresh();
  const itemsByPath = await waitFor("the sample items and their genres", async () => {
    const all = await listItems("Movie,Series,Episode");
    const found = itemPaths.map(([fake, path]) => [fake, all.find((i) => i.Path?.endsWith(path))]);
    if (found.some(([, item]) => !item)) return undefined;
    const h264 = found.find(([fake]) => fake === "item-h264")[1];
    if (!h264.Genres?.length) return undefined;
    return { all, found };
  });
  const ids = {};
  for (const [fake, item] of itemsByPath.found) {
    ids[fake] = item.Id;
    nameId(fake, item.Id);
  }
  const series = itemsByPath.all.find((i) => i.Type === "Series" && i.Name === "Synthetic Show");
  ids["series-synthetic"] = series.Id;
  nameId("series-synthetic", series.Id);
  const runtime = new Map(itemsByPath.all.map((i) => [i.Id, i.RunTimeTicks]));

  const views = (await asMe("GET", "/UserViews")).Items;
  const moviesView = views.find((v) => v.CollectionType === "movies");
  const showsView = views.find((v) => v.CollectionType === "tvshows");
  ids["view-movies"] = moviesView.Id;
  nameId("view-movies", moviesView.Id);
  nameId("view-shows", showsView.Id);

  await waitFor("the extras film's trailer and featurette", async () => {
    const trailers = await asMe("GET", `/Items/${ids["item-extras"]}/LocalTrailers`);
    const features = await asMe("GET", `/Items/${ids["item-extras"]}/SpecialFeatures`);
    if (!trailers.length || !features.length) return undefined;
    nameId("item-extras-trailer", trailers[0].Id);
    nameId("item-extras-featurette", features[0].Id);
    return true;
  });

  const wantedGenres = ["Drama", "Mystery", "Comedy", "Science Fiction"];
  const wantedPersons = ["Ada Placeholder", "Bo Example", "Cy Sample"];
  const lookupAll = async () => {
    const foundGenres = (await asMe("GET", "/Genres", { query: { parentId: ids["view-movies"] } })).Items;
    const foundPersons = (await asMe("GET", "/Persons", { query: { limit: 50 } })).Items;
    const ok = wantedGenres.every((n) => foundGenres.some((g) => g.Name === n)) && wantedPersons.every((n) => foundPersons.some((p) => p.Name === n));
    return ok ? { genres: foundGenres, persons: foundPersons } : undefined;
  };
  const { genres, persons } = await waitFor("the NFO genres and people", lookupAll);
  const genreIds = {};
  for (const [fake, name] of [
    ["genre-drama", "Drama"],
    ["genre-mystery", "Mystery"],
    ["genre-comedy", "Comedy"],
    ["genre-science-fiction", "Science Fiction"],
  ]) {
    const genre = genres.find((g) => g.Name === name);
    if (!genre) throw new Error(`genre ${name} missing; the NFOs were not read`);
    genreIds[fake] = genre.Id;
    nameId(fake, genre.Id);
  }
  const personIds = {};
  for (const [fake, name] of [
    ["person-ada", "Ada Placeholder"],
    ["person-bo", "Bo Example"],
    ["person-cy", "Cy Sample"],
  ]) {
    const person = persons.find((p) => p.Name === name);
    if (!person) throw new Error(`person ${name} missing; the NFOs were not read`);
    personIds[fake] = person.Id;
    nameId(fake, person.Id);
  }

  // The collection: the NFO <set> may not create a BoxSet (collections live in the server config).
  const findCollection = async () =>
    (await asMe("GET", "/Items", { query: { includeItemTypes: "BoxSet", recursive: true } })).Items.find((i) => i.Name === "Synthetic Collection");
  let collection = await findCollection();
  let collectionHow = "already present (made by the NFO <set> tag or an earlier run)";
  if (!collection) {
    await call(base, admin.token, "POST", "/Collections", {
      query: { name: "Synthetic Collection", ids: `${ids["item-h264"]},${ids["item-av1"]}` },
    });
    collection = await waitFor("the collection", findCollection);
    collectionHow = "with POST /Collections (the NFO <set> tag created none)";
  }
  nameId("collection-synthetic", collection.Id);
  // 12.4 left the collection empty when POST /Collections got ids, so add the two films again if
  // they are missing (POST /Collections/{id}/Items).
  const collectionChildren = async () =>
    (await asMe("GET", "/Items", { query: { parentId: collection.Id } })).Items.map((i) => i.Id);
  if ((await collectionChildren()).length < 2) {
    console.log("  collection was empty after creation; adding both films with POST /Collections/{id}/Items");
    await call(base, admin.token, "POST", `/Collections/${collection.Id}/Items`, { query: { ids: `${ids["item-h264"]},${ids["item-av1"]}` } });
    await waitFor("the collection items", async () => (await collectionChildren()).length >= 2);
  }
  console.log(`  collection: ${collectionHow}`);

  const secrets = [admin.token, me.token];
  const outDir = join(outRoot, server.folder);
  mkdirSync(outDir, { recursive: true });
  const makeSave = () => {
    const scrub = makeScrubber({
      tokens: secrets,
      host: new URL(base).host,
      fakeUserIds: [
        { real: me.userId.toLowerCase(), fake: "user-discovery" },
        { real: admin.userId.toLowerCase(), fake: "user-test" },
      ],
      fakeServerId: { real: info.Id.toLowerCase(), fake: server.fakeServerId },
      knownIds: fakeIds,
      serverNames: [info.ServerName].filter(Boolean),
    });
    return makeSaver({ outDir, folder: server.folder, scrub, secrets });
  };
  let save = makeSave();
  // A non-2xx answer is saved as { httpStatus }.
  const saveStatus = (file, { status, data }) => save(file, status >= 200 && status < 300 ? data : { httpStatus: status });

  // ---- State helpers -------------------------------------------------------
  const resetUser = async () => {
    for (const [fake] of itemPaths) {
      const id = ids[fake];
      await asMeStatus("DELETE", `/UserPlayedItems/${id}`);
      await asMe("POST", `/UserItems/${id}/UserData`, { body: { PlaybackPositionTicks: 0 } });
      await asMeStatus("DELETE", `/UserFavoriteItems/${id}`);
    }
  };
  // Marks an item played or in progress with a fixed last-played date, then reads it back.
  const setState = async (fake, { played = false, progress = 0, date, playCount }) => {
    const id = ids[fake];
    const body = {
      Played: played,
      PlayCount: playCount ?? (played ? 1 : 0),
      PlaybackPositionTicks: Math.floor((runtime.get(id) ?? 0) * progress),
      LastPlayedDate: date,
    };
    await asMe("POST", `/UserItems/${id}/UserData`, { body });
    const item = await asMe("GET", `/Items/${id}`);
    if (!item.UserData?.LastPlayedDate?.startsWith(date.slice(0, 19))) {
      throw new Error(`${server.folder} ignored LastPlayedDate for ${fake}: ${item.UserData?.LastPlayedDate}`);
    }
  };
  const recordList = async (file, path, query) => save(file, await asMe("GET", path, { query }));
  const resume = () => asMe("GET", "/UserItems/Resume", { query: { mediaTypes: "Video", limit: 16, ...card } });
  // DateCreated is added so the new-episode fixtures show the date the server gave the staged file.
  const nextUpQuery = (extra = {}) => ({ limit: 16, enableRewatching: false, ...card, fields: "PrimaryImageAspectRatio,DateCreated", ...extra });

  // ---- Scene A: static routes ------------------------------------------------
  await resetUser();
  await setState("item-h264", { played: true, date: RECENT_1 });
  await asMe("POST", `/UserFavoriteItems/${ids["item-h264"]}`);
  await recordList("discovery-similar-movie", `/Items/${ids["item-h264"]}/Similar`, { limit: 12, ...card });
  await recordList("discovery-similar-series", `/Items/${ids["series-synthetic"]}/Similar`, { limit: 12, ...card });
  await recordList("discovery-suggestions", "/Items/Suggestions", { type: "Movie,Series", limit: 12, ...card });
  await recordList("discovery-movie-recommendations", "/Movies/Recommendations", {
    parentId: ids["view-movies"], categoryLimit: 5, itemLimit: 8, fields: card.fields, enableImageTypes: card.enableImageTypes, imageTypeLimit: 1,
  });
  await recordList("discovery-genres-movies", "/Genres", { parentId: ids["view-movies"] });
  await recordList("discovery-persons", "/Persons", { limit: 50 });
  await recordList("discovery-local-trailers", `/Items/${ids["item-extras"]}/LocalTrailers`, {});
  await recordList("discovery-special-features", `/Items/${ids["item-extras"]}/SpecialFeatures`, {});
  await recordList("discovery-filters2-movies", "/Items/Filters2", { parentId: ids["view-movies"] });
  await recordList("discovery-items-by-genre", "/Items", {
    genreIds: genreIds["genre-mystery"], recursive: true, includeItemTypes: "Movie,Series", ...card,
  });
  await recordList("discovery-items-by-person", "/Items", {
    personIds: personIds["person-ada"], recursive: true, includeItemTypes: "Movie,Series", ...card,
  });

  // ---- Scene B: ordering -----------------------------------------------------
  await resetUser();
  await setState("item-multitrack", { progress: 0.4, date: RECENT_1 });
  await setState("item-ass", { progress: 0.4, date: RECENT_2 });
  await setState("item-episode-1", { played: true, date: RECENT_3 });
  await setState("item-episode-2", { progress: 0.4, date: RECENT_4 });
  save("discovery-resume-mixed", await resume());
  await recordList("discovery-nextup-resumable-true", "/Shows/NextUp", nextUpQuery({ enableResumable: true }));
  await recordList("discovery-nextup-resumable-false", "/Shows/NextUp", nextUpQuery({ enableResumable: false }));

  // ---- Scene C: ageing -------------------------------------------------------
  await resetUser();
  await setState("item-multitrack", { progress: 0.4, date: OLD });
  await setState("item-ass", { progress: 0.4, date: RECENT_2 });
  await setState("item-episode-1", { played: true, date: OLD });
  save("discovery-resume-old-and-recent", await resume());
  await recordList("discovery-nextup-no-cutoff", "/Shows/NextUp", nextUpQuery());
  await recordList("discovery-nextup-cutoff-mid", "/Shows/NextUp", nextUpQuery({ nextUpDateCutoff: CUTOFF_MID }));
  await recordList("discovery-nextup-cutoff-early", "/Shows/NextUp", nextUpQuery({ nextUpDateCutoff: CUTOFF_EARLY }));

  // ---- Scene D: zero-position reset -------------------------------------------
  const trim = (item) => ({ Id: item.Id, Name: item.Name, UserData: item.UserData });
  const trimList = (list) => ({ Items: (list.Items ?? []).map((i) => ({ Id: i.Id, Name: i.Name })) });
  const steps = [];
  const readSteps = async (fake, label) => {
    const id = ids[fake];
    const item = await asMe("GET", `/Items/${id}`);
    steps.push({ step: `${label}: read item`, request: { method: "GET", path: `/Items/${id}`, query: { userId } }, status: 200, response: trim(item) });
    const list = await resume();
    steps.push({ step: `${label}: read Resume`, request: { method: "GET", path: "/UserItems/Resume", query: { userId, mediaTypes: "Video" } }, status: 200, response: trimList(list) });
  };
  const zeroPosition = async (fake, label) => {
    const id = ids[fake];
    const body = { PlaybackPositionTicks: 0 };
    const result = await asMeStatus("POST", `/UserItems/${id}/UserData`, { body });
    steps.push({ step: `${label}: POST zero position`, request: { method: "POST", path: `/UserItems/${id}/UserData`, query: { userId }, body }, status: result.status, response: result.data });
  };
  await resetUser();
  await setState("item-multitrack", { progress: 0.4, date: RECENT_1 });
  await readSteps("item-multitrack", "never played, in progress, before");
  await zeroPosition("item-multitrack", "never played");
  await readSteps("item-multitrack", "never played, after");
  await setState("item-av1", { played: true, playCount: 1, date: OLD });
  await setState("item-av1", { progress: 0.4, date: RECENT_1, playCount: 1 });
  await readSteps("item-av1", "previously played, in progress, before");
  await zeroPosition("item-av1", "previously played");
  await readSteps("item-av1", "previously played, after");
  save("discovery-userdata-reset-sequence", { steps });

  // ---- Scene E: collections ----------------------------------------------------
  saveStatus("discovery-item-collections-member", await asMeStatus("GET", `/Items/${ids["item-h264"]}/Collections`));
  saveStatus("discovery-item-collections-non-member", await asMeStatus("GET", `/Items/${ids["item-multitrack"]}/Collections`));
  await recordList("discovery-collection-items", "/Items", { parentId: collection.Id, ...card });

  // ---- OpenAPI date parameters (acceptance item 3) ------------------------------
  const openapi = await (await fetch(`${base}/api-docs/openapi.json`)).json();
  const queryNames = (path) => (openapi.paths[path].get.parameters ?? []).filter((p) => p.in === "query").map((p) => p.name);
  save("discovery-openapi-date-params", {
    "GET /UserItems/Resume": queryNames("/UserItems/Resume"),
    "GET /Shows/NextUp": queryNames("/Shows/NextUp"),
  });

  // ---- Scene F: recently played (P16-02) ----------------------------------------
  // The newest-first list of finished films and episodes that dates a next episode by its series' last play.
  await resetUser();
  await setState("item-h264", { played: true, date: OLD });
  await setState("item-ass", { played: true, date: RECENT_2 });
  await setState("item-episode-1", { played: true, date: RECENT_3 });
  await setState("item-multitrack", { progress: 0.4, date: RECENT_1 });
  await recordList("discovery-recently-played", "/Items", {
    recursive: true,
    includeItemTypes: "Movie,Episode",
    filters: "IsPlayed",
    sortBy: "DatePlayed",
    sortOrder: "Descending",
    limit: 100,
    enableUserData: true,
    enableImages: false,
    enableTotalRecordCount: false,
  });

  // ---- Scene C2: a new episode after the cutoff -----------------------------------
  const episodeIndexed = async () => (await listItems("Episode")).find((i) => i.Path?.endsWith("Synthetic Show S01E03.mkv"));
  // The episode is useful to Next Up only once the server has read its season and episode numbers.
  const episodeNumbered = async () => {
    const found = await episodeIndexed();
    if (!found) return undefined;
    const detail = await asMe("GET", `/Items/${found.Id}`);
    return detail.IndexNumber === 3 ? detail : undefined;
  };
  try {
    await resetUser();
    await setState("item-episode-1", { played: true, date: OLD });
    await setState("item-episode-2", { played: true, date: OLD });
    await recordList("discovery-nextup-caught-up", "/Shows/NextUp", nextUpQuery());
    copyFileSync(stagedFile, copiedFile);
    await refresh();
    const episode3 = await waitFor("the staged episode and its numbers", episodeNumbered);
    nameId("item-episode-3", episode3.Id);
    save = makeSave();
    console.log(`  staged episode DateCreated ${episode3.DateCreated}`);
    await recordList("discovery-nextup-new-episode-no-cutoff", "/Shows/NextUp", nextUpQuery());
    await recordList("discovery-nextup-new-episode-cutoff-mid", "/Shows/NextUp", nextUpQuery({ nextUpDateCutoff: CUTOFF_MID }));
  } finally {
    rmSync(copiedFile, { force: true });
    await refresh();
    await waitFor("the staged episode to leave the library", async () => !(await episodeIndexed()));
  }

  await resetUser();
}
