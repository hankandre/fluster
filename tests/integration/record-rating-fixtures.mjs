// Records scrubbed personal-rating contract fixtures (P16-13) from the two fixture servers.
// Usage: pnpm samples:generate && pnpm fixture:up && pnpm fixture:setup
//        && node tests/integration/record-rating-fixtures.mjs
// Every rating is set on a throwaway user (fluster-ratings, fluster-ratings-list), never on a fixture
// user. Deleting the user deletes its user data. Never run it against a real server: it creates and
// deletes users. Credentials come from tests/integration/.credentials and are never printed.
// Scrubbing and the leak checks are shared with the other recorders (fixture-recording.mjs).
import { mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { call, callStatus, makeSaver, makeScrubber, readCredentials } from "./fixture-recording.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outRoot = join(here, "..", "fixtures", "jellyfin");
const USER_A = "fluster-ratings";
const USER_B = "fluster-ratings-list";
const THROWAWAY = [USER_A, USER_B];
const OLD = "2026-01-05T12:00:00Z";
const RECENT = "2026-06-01T12:00:00Z";

const servers = [
  { name: "jellyfin-10-11", folder: "10.11.7", fakeServerId: "server-1011" },
  { name: "jellyfin-12", folder: "12.4.0", fakeServerId: "server-124" },
];

// Films are found by file name, because metadata matching renames some titles.
const itemFiles = [
  ["item-h264", "Synthetic H264 (2024).mkv", true],
  ["item-hevc", "Synthetic HEVC HDR10 (2024).mkv", true],
  ["item-av1", "Synthetic AV1 (2024).mkv", true],
  ["item-ass", "Synthetic ASS (2024).mkv", true],
  ["item-sidecar", "Synthetic Sidecar (2024).mkv", true],
  ["item-multitrack", "Synthetic Multitrack (2024).mkv", true],
  ["item-versions", "Synthetic Versions (2024)", true],
  ["item-bluray", "Synthetic BluRay (2024)", true],
  ["item-extras", "Synthetic Extras (2024).mkv", true],
  ["item-dvdsub", "Synthetic DVDSub (2024).mkv", false],
  ["item-iso", "Synthetic ISO (2024).iso", false],
];
const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 7.5, 6.5];
const card = {
  recursive: true,
  includeItemTypes: "Movie",
  sortBy: "SortName",
  sortOrder: "Ascending",
  enableUserData: true,
  enableTotalRecordCount: true,
  fields: "PrimaryImageAspectRatio",
  imageTypeLimit: 1,
  enableImageTypes: "Primary,Backdrop,Thumb,Logo",
};

const credentials = readCredentials();
const conns = [];
const failures = [];

async function login(base, username, password) {
  const auth = await call(base, undefined, "POST", "/Users/AuthenticateByName", { body: { Username: username, Pw: password } });
  return { token: auth.AccessToken, userId: auth.User.Id };
}

async function removeThrowaway(conn) {
  const users = await call(conn.base, conn.admin.token, "GET", "/Users");
  for (const user of users.filter((u) => THROWAWAY.includes(u.Name))) await call(conn.base, conn.admin.token, "DELETE", `/Users/${user.Id}`);
  return !(await call(conn.base, conn.admin.token, "GET", "/Users")).some((u) => THROWAWAY.includes(u.Name));
}

async function connect(server) {
  const base = credentials[`${server.name}_url`];
  const admin = await login(base, credentials[`${server.name}_username`], credentials[`${server.name}_password`]);
  const conn = { server, base, admin, info: await call(base, undefined, "GET", "/System/Info/Public") };
  console.log(`${server.name}: Jellyfin ${conn.info.Version}`);
  conns.push(conn);
  if (!(await removeThrowaway(conn))) throw new Error("a leftover throwaway user could not be removed");
  return conn;
}

let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  for (const conn of conns) {
    try {
      if (!(await removeThrowaway(conn))) throw new Error("throwaway user still exists");
    } catch (error) {
      failures.push(`${conn.server.name} delete throwaway users: ${error instanceof Error ? error.message : "failed"}`);
    }
  }
  if (failures.length) {
    console.error(`clean-up failed:\n  ${failures.join("\n  ")}`);
    process.exitCode = 1;
  } else console.log("clean-up done: throwaway users deleted");
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    console.error(`${signal}: cleaning up`);
    cleanup().finally(() => process.exit(1));
  });
}

async function record(conn) {
  const { server, base, info } = conn;
  const outDir = join(outRoot, server.folder);
  mkdirSync(outDir, { recursive: true });
  const makeUser = async (name) => {
    const password = randomBytes(24).toString("base64url");
    await call(base, conn.admin.token, "POST", "/Users/New", { body: { Name: name, Password: password } });
    return login(base, name, password);
  };
  const userA = await makeUser(USER_A);
  const userB = await makeUser(USER_B);
  const secrets = [conn.admin.token, userA.token, userB.token];

  // Find the films as the admin.
  const listed = (await call(base, conn.admin.token, "GET", "/Items", {
    query: { userId: conn.admin.userId, recursive: true, includeItemTypes: "Movie", fields: "Path,MediaSources" },
  })).Items ?? [];
  const films = {};
  const knownIds = new Map();
  for (const [fake, suffix, required] of itemFiles) {
    const found = listed.find((i) => (suffix.endsWith(")") ? i.Path?.includes(suffix) : i.Path?.endsWith(suffix)));
    if (!found) {
      if (required) throw new Error(`${server.name}: sample ${suffix} is missing; run pnpm samples:generate and pnpm fixture:setup`);
      continue;
    }
    films[fake] = found;
    knownIds.set(found.Id.toLowerCase(), fake);
    for (const source of found.MediaSources ?? []) if (source.Id) knownIds.set(source.Id.toLowerCase(), fake);
  }
  const save = makeSaver({
    outDir,
    folder: server.folder,
    scrub: makeScrubber({
      tokens: secrets,
      host: new URL(base).host,
      fakeUserIds: [
        { real: userA.userId.toLowerCase(), fake: "user-ratings" },
        { real: userB.userId.toLowerCase(), fake: "user-ratings-list" },
        { real: conn.admin.userId.toLowerCase(), fake: "user-test" },
      ],
      fakeServerId: { real: info.Id.toLowerCase(), fake: server.fakeServerId },
      knownIds,
      serverNames: [info.ServerName].filter(Boolean),
    }),
    secrets,
  });

  // A user's helpers. A step is { step, request, status, response, readBack }.
  const actor = (user) => {
    const id = (film) => films[film].Id;
    const readUserData = async (film) => (await call(base, user.token, "GET", `/Items/${id(film)}`, { query: { userId: user.userId } })).UserData;
    const readBack = async (film) => {
      const item = await call(base, user.token, "GET", `/Items/${id(film)}`, { query: { userId: user.userId } });
      return { Id: item.Id, Name: item.Name, UserData: item.UserData };
    };
    const send = async (film, method, suffix, { query, body } = {}) => {
      const path = `/UserItems/${id(film)}${suffix}`;
      const result = await callStatus(base, user.token, method, path, { query, body });
      return { result, request: { method, path: `/UserItems/${film}${suffix}`, ...(query ? { query } : {}), ...(body !== undefined ? { body } : {}) } };
    };
    const step = async (label, film, method, suffix, opts) => {
      const { result, request } = await send(film, method, suffix, opts);
      return { step: label, request, status: result.status, response: result.data ?? null, readBack: await readBack(film) };
    };
    // A set-up call that must succeed.
    const setup = async (film, method, suffix, opts) => {
      const { result } = await send(film, method, suffix, opts);
      if (result.status >= 300) throw new Error(`${server.name}: set-up ${method} ${suffix} on ${film} answered ${result.status}`);
    };
    const rate = (film, Rating) => setup(film, "POST", "/UserData", { body: { Rating } });
    return { step, setup, rate, readUserData, readBack };
  };

  // Scene V: values.
  const a = actor(userA);
  const valueSteps = [];
  for (const value of VALUES) valueSteps.push(await a.step(`Rating ${value}`, "item-multitrack", "POST", "/UserData", { body: { Rating: value } }));
  const outOfRange = [];
  for (const value of [11, -1]) outOfRange.push(await a.step(`Rating ${value}`, "item-multitrack", "POST", "/UserData", { body: { Rating: value } }));
  save("rating-values-sequence", { film: "item-multitrack", steps: valueSteps, outOfRange });

  // Scene R: removal.
  const candidates = [
    ["empty body", "POST", "/UserData", { body: {} }],
    ["Rating null", "POST", "/UserData", { body: { Rating: null } }],
    ["Likes null", "POST", "/UserData", { body: { Likes: null } }],
    ["Rating 0", "POST", "/UserData", { body: { Rating: 0 } }],
    ["DELETE Rating", "DELETE", "/Rating", {}],
  ];
  const removeSteps = [];
  for (const [label, method, suffix, opts] of candidates) {
    const before = await a.step("Rating 8", "item-ass", "POST", "/UserData", { body: { Rating: 8 } });
    const after = await a.step(label, "item-ass", method, suffix, opts);
    removeSteps.push({ candidate: label, before, after });
  }
  save("rating-remove-sequence", { film: "item-ass", candidates: removeSteps });

  // Scene T: thumbs.
  const thumbs = [];
  const t = async (label, film, method, suffix, opts) => thumbs.push(await a.step(label, film, method, suffix, opts));
  const E = "item-extras";
  await t("like on an unrated film", E, "POST", "/Rating", { query: { likes: true } });
  await a.rate(E, 8);
  await t("like over a rating of 8", E, "POST", "/Rating", { query: { likes: true } });
  await a.rate(E, 8);
  await t("dislike over a rating of 8", E, "POST", "/Rating", { query: { likes: false } });
  await a.rate(E, 3);
  await t("dislike over a rating of 3", E, "POST", "/Rating", { query: { likes: false } });
  await t("DELETE Rating", E, "DELETE", "/Rating", {});
  await a.rate(E, 8);
  await t("Likes true in the body over a rating of 8", E, "POST", "/UserData", { body: { Likes: true } });
  save("rating-thumbs-sequence", { film: E, steps: thumbs });

  // Scene S: side effects.
  const post = async (path, method = "POST") => {
    const result = await callStatus(base, userA.token, method, path);
    if (result.status >= 300) throw new Error(`${server.name}: set-up ${method} ${path} answered ${result.status}`);
  };
  await a.setup("item-h264", "POST", "/UserData", { body: { Played: true, PlayCount: 1, LastPlayedDate: OLD, PlaybackPositionTicks: 0 } });
  await post(`/UserFavoriteItems/${films["item-h264"].Id}`);
  await a.setup("item-av1", "POST", "/UserData", {
    body: { Played: false, PlaybackPositionTicks: Math.floor(films["item-av1"].RunTimeTicks * 0.4), LastPlayedDate: RECENT },
  });
  const stuck = [(await a.readUserData("item-h264")), (await a.readUserData("item-av1"))];
  if (!stuck[0].Played || !stuck[0].IsFavorite || stuck[1].PlaybackPositionTicks <= 0) throw new Error(`${server.name}: side-effect states did not stick`);
  const sideFilms = [];
  for (const film of ["item-h264", "item-av1", "item-sidecar"]) {
    const before = await a.readUserData(film);
    await a.setup(film, "POST", "/UserData", { body: { Rating: 8 } });
    const afterRating = await a.readUserData(film);
    await a.setup(film, "POST", "/Rating", { query: { likes: true } });
    const afterLike = await a.readUserData(film);
    await a.setup(film, "DELETE", "/Rating", {});
    const afterDelete = await a.readUserData(film);
    sideFilms.push({ film, before, afterRating, afterLike, afterDelete });
  }
  save("rating-side-effects", {
    requests: [
      { method: "POST", path: "/UserItems/{id}/UserData", body: { Rating: 8 } },
      { method: "POST", path: "/UserItems/{id}/Rating", query: { likes: true } },
      { method: "DELETE", path: "/UserItems/{id}/Rating" },
    ],
    films: sideFilms,
  });

  // Scene L: lists, as the second user.
  const b = actor(userB);
  const setupLog = [];
  const did = (film, action) => setupLog.push({ film, action });
  for (const [film, value] of [["item-h264", 10], ["item-av1", 8], ["item-multitrack", 7.5], ["item-ass", 6], ["item-sidecar", 1]]) {
    await b.rate(film, value);
    did(film, `POST UserData Rating ${value}`);
  }
  await b.setup("item-extras", "POST", "/Rating", { query: { likes: true } });
  did("item-extras", "POST Rating likes=true");
  await b.rate("item-versions", 9);
  await b.setup("item-versions", "DELETE", "/Rating", {});
  did("item-versions", "POST UserData Rating 9, then DELETE Rating");
  const bPost = async (path) => {
    const result = await callStatus(base, userB.token, "POST", path);
    if (result.status >= 300) throw new Error(`${server.name}: set-up POST ${path} answered ${result.status}`);
  };
  await bPost(`/UserFavoriteItems/${films["item-hevc"].Id}`);
  did("item-hevc", "POST UserFavoriteItems");
  await b.setup("item-bluray", "POST", "/UserData", { body: { Played: true, PlayCount: 1, LastPlayedDate: OLD } });
  did("item-bluray", "POST UserData Played true, PlayCount 1");
  const rated = { "item-h264": 10, "item-av1": 8, "item-multitrack": 7.5, "item-ass": 6, "item-sidecar": 1 };
  for (const [film, value] of Object.entries(rated)) {
    if ((await b.readUserData(film)).Rating !== value) throw new Error(`${server.name}: rating of ${film} did not stick`);
  }
  const list = (query) => call(base, userB.token, "GET", "/Items", { query: { userId: userB.userId, ...card, ...query } });
  save("rating-list-likes", await list({ filters: "Likes" }));
  save("rating-list-dislikes", await list({ filters: "Dislikes" }));
  // A server may refuse the combination, so the status is saved with the answer.
  const both = await callStatus(base, userB.token, "GET", "/Items", { query: { userId: userB.userId, ...card, filters: "Likes,Dislikes" } });
  save("rating-list-likes-and-dislikes", { httpStatus: both.status, ...(both.status < 300 ? both.data : {}) });
  save("rating-list-favorite-or-likes", await list({ filters: "IsFavoriteOrLikes" }));
  save("rating-list-all-movies", { setup: setupLog, ...(await list({})) });
  save("rating-list-likes-page-1", await list({ filters: "Likes", limit: 2, startIndex: 0 }));
  save("rating-list-likes-page-2", await list({ filters: "Likes", limit: 2, startIndex: 2 }));

  // OpenAPI.
  const openapi = await (await fetch(`${base}/api-docs/openapi.json`)).json();
  const query = (p) => (openapi.paths?.[p]?.get?.parameters ?? []).filter((x) => x.in === "query").map((x) => x.name);
  const methods = (p) => (openapi.paths?.[p] ? Object.keys(openapi.paths[p]).sort() : "absent");
  const schemas = openapi.components?.schemas ?? {};
  save("rating-openapi", {
    "GET /Items": query("/Items"),
    ItemSortBy: schemas.ItemSortBy?.enum ?? "absent",
    ItemFilter: schemas.ItemFilter?.enum ?? "absent",
    UpdateUserItemDataDto: schemas.UpdateUserItemDataDto?.properties ? Object.keys(schemas.UpdateUserItemDataDto.properties) : "absent",
    "/UserItems/{itemId}/Rating": methods("/UserItems/{itemId}/Rating"),
    "/UserItems/{itemId}/UserData": methods("/UserItems/{itemId}/UserData"),
  });
}

try {
  for (const server of servers) await connect(server);
  for (const conn of conns) {
    console.log(`recording ${conn.server.folder}`);
    await record(conn);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "failed");
  process.exitCode = 1;
} finally {
  await cleanup();
}
