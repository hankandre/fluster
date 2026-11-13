import { afterEach, expect, it } from "vitest";
import type { PlaybackDiagnostics } from "../../domain/playback";
import { lastDecode, recordDecode, resetLastDecode } from "./last-decode";

afterEach(resetLastDecode);

const base: PlaybackDiagnostics = { decodeMode: "unknown", decodeLabel: "Unknown", droppedFrames: 0 };

it("records hardware decode with the decoder name", () => {
  recordDecode({ ...base, decodeMode: "hardware", hwdecCurrent: "vaapi" });
  expect(lastDecode()).toEqual({ mode: "hardware", hwdec: "vaapi" });
});

it("records software decode", () => {
  recordDecode({ ...base, decodeMode: "software", hwdecCurrent: "no" });
  expect(lastDecode()).toEqual({ mode: "software" });
});

it("ignores unknown and missing diagnostics, keeping the earlier answer", () => {
  recordDecode({ ...base, decodeMode: "software" });
  recordDecode({ ...base, decodeMode: "unknown" });
  recordDecode(undefined);
  expect(lastDecode()).toEqual({ mode: "software" });
});

it("keeps only the mode and the decoder name", () => {
  recordDecode({ ...base, decodeMode: "hardware", hwdecCurrent: "vaapi", videoCodec: "h264", videoOutput: "https://x.test/y", width: 1920 });
  expect(Object.keys(lastDecode()!).sort()).toEqual(["hwdec", "mode"]);
});
