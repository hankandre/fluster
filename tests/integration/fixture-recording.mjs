// Helpers shared by the fixture recorders (record-fixtures.mjs, record-discovery-fixtures.mjs).
// Credentials come from tests/integration/.credentials and are never printed.
// Scrubbing follows .claude/skills/jellyfin-api/references/contract-fixtures.md.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function readCredentials() {
  const values = {};
  for (const line of readFileSync(join(here, ".credentials"), "utf8").split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) values[line.slice(0, at)] = line.slice(at + 1);
  }
  return values;
}

export const CLIENT = 'MediaBrowser Client="Fluster Tests", Device="ci", DeviceId="fluster-fixtures", Version="0"';

export async function call(base, token, method, path, { query, body } = {}) {
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

// Like call, but returns { status, data } and never throws on a non-2xx answer, so a recorder
// can save a 404 as a fixture.
export async function callStatus(base, token, method, path, { query, body } = {}) {
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
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  return { status: response.status, data };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


// Scrubbing. Known ids get readable fake names; every other 32-character hex
// value (tags, ETags, other ids) gets a numbered fake so references line up.
export function makeScrubber({ tokens, host, fakeUserIds, fakeServerId, knownIds, serverNames }) {
  const fakes = new Map(knownIds);
  let counter = 0;
  const fake = (value) => {
    if (!fakes.has(value)) fakes.set(value, `id-${(counter += 1)}`);
    return fakes.get(value);
  };
  const scrubText = (text) => {
    let result = text;
    for (const token of tokens) result = result.split(token).join("REDACTED");
    // Credential parameter values are replaced; names and every other parameter stay, so
    // TranscodingUrl keeps TranscodeReasons, VideoCodec, and the rest (P10-02).
    result = result.replace(/([?&](?:ApiKey|api_key|ApiToken|Token|AccessToken|access_token|X-Emby-Token)=)[^&"\s]*/gi, "$1REDACTED");
    result = result.replace(/([?&]PlaySessionId=)[^&"\s]*/gi, "$1play-session-1");
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
  for (const id of fakeUserIds) fakes.set(id.real, id.fake);
  fakes.set(fakeServerId.real, fakeServerId.fake);
  return (data) => walk(data);
}


// Returns save(file, data): scrubs, runs the two leak checks, and writes <outDir>/<file>.json.
// `secrets` holds every token the recorder authenticated with.
export function makeSaver({ outDir, folder, scrub, secrets }) {
  return (file, data) => {
    const text = JSON.stringify(scrub(data), null, 2) + "\n";
    for (const secret of secrets) {
      if (text.includes(secret)) throw new Error(`token leaked into ${file}`);
    }
    // Every credential parameter value in a TranscodingUrl must be REDACTED.
    if (/(?:ApiKey|api_key|ApiToken|AccessToken|access_token|X-Emby-Token|Token)(?:=|%3D)(?!REDACTED(?:&|$|"|%26))/i.test(text)) {
      throw new Error(`unscrubbed key in ${file}`);
    }
    writeFileSync(join(outDir, `${file}.json`), text);
    console.log(`  wrote ${folder}/${file}.json`);
  };
}
