import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The shape of tests/fixtures/hls-playlists.json, the playlist rules every
// native validator must pass (tests/fixtures/README.md). Until a native
// validator runs the vectors (Kotlin in T8-08), this keeps the file itself
// sound: the count, a closed schema, unique names, known reason codes, and
// synthetic hosts only.
const FILE = join(__dirname, "../../../tests/fixtures/hls-playlists.json");
const VECTOR_COUNT = 210;
const VECTOR_KEYS = ["name", "rule", "playlistKind", "body", "baseUrl", "serverOrigin", "token", "expected"];
const REASONS = ["malformed", "not-complete", "unsafe-uri", "credential-in-playlist"];

interface Vector {
  name: string;
  rule: string;
  playlistKind: string;
  body: string;
  baseUrl: string;
  serverOrigin: string;
  token?: string;
  expected: { verdict: string; reason?: string; servedBody?: string; children?: string[] };
}

const text = readFileSync(FILE, "utf8");
const file = JSON.parse(text) as { description: string; vectors: Vector[] };

describe("tests/fixtures/hls-playlists.json", () => {
  it("has a description and exactly the documented number of vectors", () => {
    expect(Object.keys(file).sort()).toEqual(["description", "vectors"]);
    expect(file.vectors).toHaveLength(VECTOR_COUNT);
  });

  it("uses a closed schema", () => {
    for (const vector of file.vectors) {
      for (const key of Object.keys(vector)) expect(VECTOR_KEYS, `${vector.name}: ${key}`).toContain(key);
      for (const key of VECTOR_KEYS.filter((name) => name !== "token")) expect(vector, vector.name).toHaveProperty(key);
    }
  });

  it("names every vector uniquely", () => {
    const names = file.vectors.map((vector) => vector.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every vector a known kind and verdict, and every refusal a known reason", () => {
    for (const vector of file.vectors) {
      expect(["master", "media"], vector.name).toContain(vector.playlistKind);
      const { verdict, reason, servedBody, children } = vector.expected;
      if (verdict === "refuse") {
        expect(REASONS, vector.name).toContain(reason);
        expect(servedBody, vector.name).toBeUndefined();
      } else {
        expect(verdict, vector.name).toBe("accept");
        expect(reason, vector.name).toBeUndefined();
        expect(typeof servedBody, vector.name).toBe("string");
        if (children !== undefined) expect(vector.playlistKind, vector.name).toBe("master");
      }
    }
  });

  it("names no real server", () => {
    expect(text).not.toContain("192.168.");
    for (const vector of file.vectors) {
      for (const url of [vector.baseUrl, vector.serverOrigin]) {
        const host = new URL(url).hostname;
        expect(host === "127.0.0.1" || host === "example.test" || host.endsWith(".example.test"), `${vector.name}: ${host}`).toBe(true);
      }
    }
  });
});
