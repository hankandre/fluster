// The shared URL conformance suite (T2-06). It runs both shared URL files
// against the host's own `URL` and `URLSearchParams`, through the same
// functions the core uses, so the app can run it on a device (T3-02) and Node
// can run it in Vitest. It imports no test runner and no Node module, never
// throws, and reports fixture names and fixed words only, never an error.
import hlsMasterUrls from "../../tests/fixtures/hls-master-urls.json";
import hostClasses from "../../tests/fixtures/host-classes.json";
import { classifyServerAddress } from "../domain/host-class";
import type { HlsMediaKind } from "../domain/playback";
import { rebuildMasterUrl } from "../jellyfin/hls-url";

export interface UrlConformanceFailure {
  file: "host-classes" | "hls-master-urls";
  // The vector's `url` (host classes) or `name` (HLS). Fixture text only.
  vector: string;
  expected: string;
  // A class, "accepted", "refused", "rebuilt differently" or "threw". Never an error message.
  actual: string;
}

export interface UrlConformanceReport {
  total: number;
  passed: number;
  failures: UrlConformanceFailure[];
}

interface HostClassVector {
  url: string;
  class: string;
}

interface HlsContext {
  serverUrl: string;
  itemId: string;
  mediaSourceId: string;
  mediaKind: HlsMediaKind;
  playSessionId: string;
}

interface HlsPlanVector {
  name: string;
  plan: HlsContext & { streamUrl: string };
}

interface HlsRefusalVector extends HlsContext {
  name: string;
  url: string;
  typescript: { verdict: "refuse" } | { verdict: "rebuild"; url: string };
}

const hostVectors = (hostClasses as unknown as { vectors: HostClassVector[] }).vectors;
const hlsFile = hlsMasterUrls as unknown as { vectors: HlsPlanVector[]; refusals: HlsRefusalVector[] };

function contextOf(source: HlsContext): HlsContext {
  return {
    serverUrl: source.serverUrl,
    itemId: source.itemId,
    mediaSourceId: source.mediaSourceId,
    mediaKind: source.mediaKind,
    playSessionId: source.playSessionId,
  };
}

// Returns the failure's `actual` word, or undefined when the vector passes.
function checkHostClass(vector: HostClassVector): string | undefined {
  const actual = classifyServerAddress(vector.url);
  return actual === vector.class ? undefined : actual;
}

function checkRebuildsToItself(vector: HlsPlanVector): string | undefined {
  const result = rebuildMasterUrl(vector.plan.streamUrl, contextOf(vector.plan));
  if (!result.ok) return "refused";
  return result.url === vector.plan.streamUrl ? undefined : "rebuilt differently";
}

function checkRefusal(vector: HlsRefusalVector): string | undefined {
  const result = rebuildMasterUrl(vector.url, contextOf(vector));
  if (vector.typescript.verdict === "refuse") return result.ok ? "accepted" : undefined;
  if (!result.ok) return "refused";
  return result.url === vector.typescript.url ? undefined : "rebuilt differently";
}

export function runUrlConformance(): UrlConformanceReport {
  const failures: UrlConformanceFailure[] = [];
  let total = 0;

  function run(file: UrlConformanceFailure["file"], vector: string, expected: string, check: () => string | undefined): void {
    total += 1;
    let actual: string | undefined;
    try {
      actual = check();
    } catch {
      actual = "threw";
    }
    if (actual !== undefined) failures.push({ file, vector, expected, actual });
  }

  for (const vector of hostVectors) {
    run("host-classes", vector.url, vector.class, () => checkHostClass(vector));
  }
  for (const vector of hlsFile.vectors) {
    run("hls-master-urls", vector.name, "rebuilt", () => checkRebuildsToItself(vector));
  }
  for (const vector of hlsFile.refusals) {
    run("hls-master-urls", vector.name, vector.typescript.verdict === "refuse" ? "refused" : "rebuilt", () => checkRefusal(vector));
  }
  return { total, passed: total - failures.length, failures };
}
