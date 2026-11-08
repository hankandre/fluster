import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../../domain/catalog";
import type { PlaybackPlan } from "../../domain/playback";
import { JellyfinGateway } from "./gateway";
import type { HttpTransport, PlaybackInfoResponse } from "./types";

// The HLS plans this negotiation builds from every recorded conversion
// (P10-02 fixtures, both servers), on a server with and without a base path,
// are the shared vectors in tests/fixtures/hls-master-urls.json. Rust
// deserializes each plan as its launch request and re-checks the master URL
// (`master_url_tests.rs`), so the TypeScript rebuild and the Rust validator
// cannot drift (P10-04). Regenerate after a deliberate change with
// FLUSTER_WRITE_HLS_VECTORS=1 pnpm vitest run hls-rust-vectors.
const VECTOR_FILE = join(__dirname, "../../../tests/fixtures/hls-master-urls.json");
const FIXTURE_ROOT = join(__dirname, "../../../tests/fixtures/jellyfin");

const VERSIONS = ["10.11.7", "12.4.0"];
const SERVERS = ["http://127.0.0.1:8096", "https://media.test/jellyfin"];
// Every recorded answer that converts, with the item id the recorder
// scrubbed it to.
const CONVERSIONS: [string, string][] = [
  ["h264-force-fallback", "item-h264"],
  ["h264-limited", "item-h264"],
  ["hevc-hdr10-force-fallback", "item-hevc"],
  ["av1-force-fallback", "item-av1"],
  ["ass-force-fallback", "item-ass"],
  ["sidecar-force-fallback", "item-sidecar"],
  ["multitrack-force-fallback", "item-multitrack"],
  ["dvdsub-force-fallback", "item-dvdsub"],
  ["iso-force-fallback", "item-iso"],
  ["bluray-folder", "item-bluray"],
  ["bluray-folder-force-fallback", "item-bluray"],
];

interface Vector {
  name: string;
  plan: Omit<PlaybackPlan, "authorization">;
}

class AnswerTransport implements HttpTransport {
  constructor(private readonly answer: PlaybackInfoResponse) {}

  async get<T>(): Promise<{ data: T }> {
    throw new Error("unexpected GET");
  }

  async post<T>(url: string): Promise<{ data: T }> {
    if (url === "/Users/AuthenticateByName") {
      return { data: { AccessToken: "test-token", User: { Id: "user-test", Name: "tester" } } as T };
    }
    return { data: structuredClone(this.answer) as T };
  }

  async delete<T>(): Promise<{ data: T }> {
    throw new Error("unexpected DELETE");
  }
}

async function hlsPlan(server: string, answer: PlaybackInfoResponse, itemId: string): Promise<Vector["plan"]> {
  const gateway = new JellyfinGateway(server, new AnswerTransport(answer), "install-1");
  await gateway.login("tester", "password");
  const item: LibraryItem = { id: itemId, name: "Fixture", type: "Movie", resumePositionTicks: 0, played: false };
  const { authorization, ...plan } = await gateway.createPlaybackPlan(item);
  expect(authorization).toContain("test-token");
  return plan;
}

async function buildVectors(): Promise<Vector[]> {
  const vectors: Vector[] = [];
  for (const version of VERSIONS) {
    for (const [sample, itemId] of CONVERSIONS) {
      const answer = JSON.parse(readFileSync(join(FIXTURE_ROOT, version, `conversion-${sample}.json`), "utf8")) as PlaybackInfoResponse;
      for (const server of SERVERS) {
        vectors.push({ name: `${version} ${sample} ${server}`, plan: await hlsPlan(server, answer, itemId) });
      }
    }
  }
  return vectors;
}

describe("HLS vectors shared with Rust", () => {
  it("are the plans this negotiation builds today", async () => {
    const vectors = await buildVectors();
    for (const { name, plan } of vectors) {
      expect(plan.delivery, name).toBe("hls");
      expect(JSON.stringify(plan), name).not.toMatch(/test-token|api_?key=|access_?token=/i);
    }
    // Both base paths reach the vectors: the master URL keeps `/jellyfin`.
    expect(vectors.some(({ plan }) => new URL(plan.streamUrl).pathname.startsWith("/jellyfin/videos/"))).toBe(true);
    if (process.env.FLUSTER_WRITE_HLS_VECTORS === "1") {
      const description = "HLS plans built by src/lib/jellyfin/hls-rust-vectors.test.ts from the recorded conversion fixtures. Rust deserializes each plan and re-checks its master URL (src-tauri/src/player/hls/master_url_tests.rs).";
      writeFileSync(VECTOR_FILE, `${JSON.stringify({ description, vectors }, null, 2)}\n`);
    }
    const committed = JSON.parse(readFileSync(VECTOR_FILE, "utf8")) as { vectors: Vector[] };
    expect(committed.vectors).toEqual(vectors);
  });
});
