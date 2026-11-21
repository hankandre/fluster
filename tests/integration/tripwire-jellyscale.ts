// Jellyscale's side of the tripwire (T2-09): preparation, item lookup and the job oracle. Jellyscale has no
// library-scan route, no ffmpeg-only signal (it runs ffmpeg for frame, subtitle and image-track extraction) and its
// log carries play-session ids, so its authoritative job signal is the transcode_jobs table, read through psql in the
// fixture's database container. The count is two numbers and no id, so no play-session id reaches the log.
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { classifyProcess } from "./tripwire-rules";
import { listProcesses, sleep } from "./tripwire-container";
import type { ItemDto, MonitorClient } from "./tripwire-server";

const run = promisify(execFile);
const composeFile = join(dirname(fileURLToPath(import.meta.url)), "docker-compose.yml");
const SETTLE_TIMEOUT_MS = 120_000;
const SETTLE_POLL_MS = 2000;
export const ITEMS_QUERY = "/Items?Recursive=true&Fields=Path,MediaSources&IncludeItemTypes=Movie,Episode,Video";

export interface JobRowCounts {
  total: number;
  active: number;
}

// Rows in transcode_jobs: all of them, and those still queued or running.
export async function jobRowCounts(): Promise<JobRowCounts> {
  const { stdout } = await run(
    "docker",
    ["compose", "-f", composeFile, "exec", "-T", "jellyscale-db", "psql", "-U", "postgres", "-At", "-c",
      "select count(*), count(*) filter (where state in ('queued','running')) from transcode_jobs"],
    { maxBuffer: 1024 * 1024 },
  );
  const [total, active] = stdout.trim().split("|").map(Number);
  if (!Number.isInteger(total) || !Number.isInteger(active)) throw new Error("the transcode_jobs count did not answer two numbers");
  return { total, active };
}

// Waits until the item list is the same for two polls, no ffmpeg or ffprobe process runs in the container, and no
// transcode job is queued or running.
export async function prepareJellyscale(monitor: MonitorClient): Promise<{ items: ItemDto[]; preparation: Record<string, unknown> }> {
  const started = Date.now();
  let lastCount = -1;
  let stablePolls = 0;
  while (Date.now() - started < SETTLE_TIMEOUT_MS) {
    const result = (await monitor.request("GET", ITEMS_QUERY)) as { Items?: ItemDto[] };
    const items = result.Items ?? [];
    const encoders = (await listProcesses("jellyscale")).filter((process) => classifyProcess(process.command) !== "other");
    const { active, total } = await jobRowCounts();
    const quiet = items.length > 0 && encoders.length === 0 && active === 0;
    stablePolls = quiet && items.length === lastCount ? stablePolls + 1 : 0;
    lastCount = items.length;
    if (stablePolls >= 1) return { items, preparation: { settleSeconds: Math.round((Date.now() - started) / 1000), indexedItems: items.length, jobRowsAtStart: total } };
    await sleep(SETTLE_POLL_MS);
  }
  throw new Error(`Jellyscale did not settle within ${SETTLE_TIMEOUT_MS / 1000}s`);
}

const FILE_EXTENSION = /\.[A-Za-z0-9]{2,5}$/;

// Jellyscale's item Paths are library-relative ("Synthetic H264 (2024)/Synthetic H264 (2024).mkv"), so a sample's
// absolute path ends with "/" + the item's Path. A disc folder is the one item whose Path starts with the folder's
// name, because Jellyscale lists the folder's .m2ts as a plain film.
export function findJellyscaleItem(items: readonly ItemDto[], samplePath: string): ItemDto | undefined {
  if (FILE_EXTENSION.test(samplePath)) return items.find((item) => item.Path !== undefined && samplePath.endsWith(`/${item.Path}`));
  const folder = samplePath.slice(samplePath.lastIndexOf("/") + 1);
  return items.find((item) => item.Path?.startsWith(`${folder}/`));
}

export function listedPaths(items: readonly ItemDto[]): string[] {
  return items.flatMap((item) => (item.Path ? [item.Path] : []));
}

// Whether the gateway can match Jellyscale's /Sessions entry to the plan (the core matches on MediaSourceId, which
// Jellyscale's PlayState lacks). Pinned by T2-09 milestone 1; either value is asserted, so a change is seen.
export const JELLYSCALE_PLAY_METHOD_CHECK: "answered" | "unanswered" = "unanswered";
