// @vitest-environment node
// T2-06 acceptance item 3: an HLS master URL whose host is not written in plain ASCII is refused with detail
// `host`, even when a WHATWG parser maps it onto the server's origin.
import { describe, expect, it } from "vitest";
import shared from "../../tests/fixtures/hls-master-urls.json";
import { rebuildMasterUrl, type HlsMediaKind } from "./hls-url";

interface SharedRefusal {
  name: string;
  rule: string;
  url: string;
  serverUrl: string;
  mediaKind: HlsMediaKind;
  itemId: string;
  mediaSourceId: string;
  playSessionId: string;
  typescript: { verdict: string };
}

interface SharedPlan {
  name: string;
  plan: { streamUrl: string; serverUrl: string; itemId: string; mediaSourceId: string; mediaKind: HlsMediaKind; playSessionId: string };
}

const NAMES = [
  "fullwidth host",
  "long s in the host",
  "percent-encoded host",
  "fullwidth digits in the address",
  "internationalized host on a punycode server",
  "relative URL on a non-ASCII server URL",
  "backslash authority",
  "tab in the host",
];

const { refusals, vectors } = shared as unknown as { refusals: SharedRefusal[]; vectors: SharedPlan[] };

describe("master URLs with a host that is not plain ASCII", () => {
  it.each(NAMES.map((name) => [name] as const))("has %s as a host refusal in the shared file", (name) => {
    const refusal = refusals.find((entry) => entry.name === name);
    expect(refusal).toBeDefined();
    expect(refusal?.rule).toBe("host");
    expect(refusal?.typescript).toEqual({ verdict: "refuse" });
  });

  it.each(NAMES.map((name) => [name] as const))("refuses %s with detail host and echoes none of it", (name) => {
    const refusal = refusals.find((entry) => entry.name === name) as SharedRefusal;
    const result = rebuildMasterUrl(refusal.url, {
      serverUrl: refusal.serverUrl,
      itemId: refusal.itemId,
      mediaSourceId: refusal.mediaSourceId,
      mediaKind: refusal.mediaKind,
      playSessionId: refusal.playSessionId,
    });
    expect(result).toEqual({ ok: false, detail: "host" });
    const text = JSON.stringify(result);
    expect(text).not.toContain("DeviceId");
    expect(text).not.toContain("PlaySessionId");
    expect(text).not.toContain(refusal.itemId);
  });

  it("still rebuilds every recorded plan into itself", () => {
    expect(vectors).toHaveLength(44);
    for (const { name, plan } of vectors) {
      const result = rebuildMasterUrl(plan.streamUrl, {
        serverUrl: plan.serverUrl,
        itemId: plan.itemId,
        mediaSourceId: plan.mediaSourceId,
        mediaKind: plan.mediaKind,
        playSessionId: plan.playSessionId,
      });
      expect(result, name).toMatchObject({ ok: true, url: plan.streamUrl });
    }
  });
});
