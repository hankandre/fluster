import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../domain/catalog";
import type { PlaybackPlan } from "../domain/playback";
import { JellyfinGateway } from "./gateway";
import type { PlaybackInfoResponse } from "./types";
import type { SignInRequest, SignInResult, Transport, TransportRequest, TransportResponse } from "../ports/transport";
import { webCrypto } from "../adapters/web-crypto";

// The HLS plans this negotiation builds from every recorded conversion
// (P10-02 fixtures, both servers), on a server with and without a base path,
// are the shared vectors in packages/core/tests/fixtures/hls-master-urls.json. Every native
// validator deserializes each plan as its launch request and re-checks the
// master URL (Kotlin in T8-08), so the TypeScript rebuild and the native
// validators cannot drift. Regenerate after a deliberate change with
// OCTAVE_WRITE_HLS_VECTORS=1 pnpm vitest run hls-master-url-vectors.
const VECTOR_FILE = join(__dirname, "../../tests/fixtures/hls-master-urls.json");
const FIXTURE_ROOT = join(__dirname, "../../tests/fixtures/jellyfin");

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
  plan: PlaybackPlan;
}

class AnswerTransport implements Transport {
  constructor(private readonly answer: PlaybackInfoResponse) {}

  async signIn(_request: SignInRequest): Promise<SignInResult> {
    return { session: "session-1", userId: "user-test", userName: "tester" };
  }

  async request(request: TransportRequest): Promise<TransportResponse> {
    if (request.method !== "POST") throw new Error(`unexpected ${request.method}`);
    return { status: 200, body: structuredClone(this.answer) };
  }

  async endSession(): Promise<void> {}
}

async function hlsPlan(server: string, answer: PlaybackInfoResponse, itemId: string): Promise<Vector["plan"]> {
  const gateway = new JellyfinGateway(server, webCrypto, new AnswerTransport(answer), "install-1");
  await gateway.login("tester", "password");
  const item: LibraryItem = { id: itemId, name: "Fixture", type: "Movie", resumePositionTicks: 0, played: false };
  const plan = await gateway.createPlaybackPlan(item);
  expect(plan).not.toHaveProperty("authorization");
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

describe("HLS vectors shared with every native validator", () => {
  it("are the plans this negotiation builds today", async () => {
    const vectors = await buildVectors();
    for (const { name, plan } of vectors) {
      expect(plan.delivery, name).toBe("hls");
      expect(JSON.stringify(plan), name).not.toMatch(/test-token|api_?key=|access_?token=/i);
    }
    // Both base paths reach the vectors: the master URL keeps `/jellyfin`.
    expect(vectors.some(({ plan }) => new URL(plan.streamUrl).pathname.startsWith("/jellyfin/videos/"))).toBe(true);
    if (process.env.OCTAVE_WRITE_HLS_VECTORS === "1") {
      // The description and the `refusals` (hls-url.test.ts) are kept as they are.
      const { description, refusals } = JSON.parse(readFileSync(VECTOR_FILE, "utf8")) as { description: string; refusals: unknown[] };
      writeFileSync(VECTOR_FILE, `${JSON.stringify({ description, vectors, refusals }, null, 2)}\n`);
    }
    const committed = JSON.parse(readFileSync(VECTOR_FILE, "utf8")) as { vectors: Vector[] };
    expect(committed.vectors).toEqual(vectors);
  });
});
