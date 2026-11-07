// Jellyfin API side of the tripwire: a monitor session separate from the
// gateway's, and the wait for a quiet, fully scanned library.
import { classifyProcess, findTranscodingSessions } from "./tripwire-rules";
import type { SessionLike, TranscodingSession } from "./tripwire-rules";
import { listProcesses, sleep } from "./tripwire-container";

const SCAN_TIMEOUT_MS = 300_000;
const SESSION_POLL_MS = 250;
const MONITOR_CLIENT = 'MediaBrowser Client="Fluster Tripwire", Device="ci", DeviceId="fluster-tripwire-monitor", Version="0"';

export class MonitorClient {
  private token = "";

  // The token is handed to onSecret so the caller can keep it out of logs.

  constructor(
    readonly baseUrl: string,
    private readonly onSecret: (value: string) => void,
  ) {}

  async login(username: string, password: string): Promise<void> {
    const response = await this.request("POST", "/Users/AuthenticateByName", { Username: username, Pw: password });
    this.token = (response as { AccessToken: string }).AccessToken;
    this.onSecret(this.token);
  }

  async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(this.baseUrl + path, {
      method,
      headers: {
        Authorization: this.token ? `${MONITOR_CLIENT}, Token="${this.token}"` : MONITOR_CLIENT,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${method} ${path.split("?")[0]} returned ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  }

  async sessions(): Promise<(SessionLike & { NowPlayingItem?: { Id?: string } })[]> {
    return (await this.request("GET", "/Sessions")) as (SessionLike & { NowPlayingItem?: { Id?: string } })[];
  }

  async logout(): Promise<void> {
    if (this.token) await this.request("POST", "/Sessions/Logout").catch(() => undefined);
  }
}

export interface ItemDto {
  Id: string;
  Name?: string;
  Type?: string;
  Path?: string;
  VideoType?: string;
  SeriesName?: string;
  MediaSources?: unknown[];
}

// Starts a library scan and waits until the server is quiet: the scan task is
// idle, every sample is indexed (both versions merged), the item count is
// stable, and no ffmpeg or ffprobe process is running.
export async function prepareServer(monitor: MonitorClient, service: string, samplePaths: string[]): Promise<{ items: ItemDto[]; preparation: Record<string, unknown> }> {
  const preparation: Record<string, unknown> = {};
  const folders = (await monitor.request("GET", "/Library/VirtualFolders")) as { Name: string; LibraryOptions?: Record<string, unknown> }[];
  preparation.libraryImageExtraction = folders.map((folder) => ({
    library: folder.Name,
    EnableTrickplayImageExtraction: folder.LibraryOptions?.EnableTrickplayImageExtraction,
    ExtractTrickplayImagesDuringLibraryScan: folder.LibraryOptions?.ExtractTrickplayImagesDuringLibraryScan,
    EnableChapterImageExtraction: folder.LibraryOptions?.EnableChapterImageExtraction,
    ExtractChapterImagesDuringLibraryScan: folder.LibraryOptions?.ExtractChapterImagesDuringLibraryScan,
  }));
  for (const folder of folders) {
    const options = folder.LibraryOptions ?? {};
    for (const key of ["EnableTrickplayImageExtraction", "ExtractTrickplayImagesDuringLibraryScan", "EnableChapterImageExtraction", "ExtractChapterImagesDuringLibraryScan"]) {
      if (options[key] === true) {
        throw new Error(`library ${folder.Name} has ${key} enabled; its ffmpeg runs would be indistinguishable from playback encodes. Recreate the fixture with pnpm fixture:down && pnpm fixture:up && pnpm fixture:setup.`);
      }
    }
  }

  const started = Date.now();
  await monitor.request("POST", "/Library/Refresh");
  let lastCount = -1;
  let stablePolls = 0;
  while (Date.now() - started < SCAN_TIMEOUT_MS) {
    await sleep(2000);
    const tasks = (await monitor.request("GET", "/ScheduledTasks?isHidden=false")) as { Key?: string; State?: string }[];
    const busyTasks = tasks.filter((task) => task.State !== "Idle").map((task) => task.Key);
    const result = (await monitor.request("GET", "/Items?Recursive=true&Fields=Path,MediaSources&IncludeItemTypes=Movie,Episode,Video")) as { Items?: ItemDto[] };
    const items = result.Items ?? [];
    const allFound = samplePaths.every((path) => items.some((item) => item.Path === path));
    const versions = items.find((item) => item.Path?.includes("Synthetic Versions (2024)"));
    const merged = (versions?.MediaSources?.length ?? 0) >= 2;
    const encoders = (await listProcesses(service)).filter((process) => classifyProcess(process.command) !== "other");
    const quiet = busyTasks.length === 0 && allFound && merged && encoders.length === 0;
    stablePolls = quiet && items.length === lastCount ? stablePolls + 1 : 0;
    lastCount = items.length;
    if (stablePolls >= 2) {
      preparation.scanSeconds = Math.round((Date.now() - started) / 1000);
      preparation.indexedItems = items.length;
      return { items, preparation };
    }
  }
  throw new Error(`library scan did not settle within ${SCAN_TIMEOUT_MS / 1000}s`);
}

// Polls /Sessions while a sample plays. A short transcode can come and go
// between two single checks, so the whole playback window is watched.
export class SessionWatcher {
  readonly transcoding: TranscodingSession[] = [];
  readonly playMethods = new Set<string>();
  readonly errors: string[] = [];
  polls = 0;
  // Polls in which our own session showed the sample as now playing.
  sawOurSession = 0;
  private running = false;
  private loop?: Promise<void>;

  constructor(private readonly monitor: MonitorClient) {}

  start(itemId: string): void {
    this.transcoding.length = 0;
    this.playMethods.clear();
    this.errors.length = 0;
    this.polls = 0;
    this.sawOurSession = 0;
    this.running = true;
    this.loop = (async () => {
      while (this.running) {
        await this.pollOnce(itemId);
        await sleep(SESSION_POLL_MS);
      }
    })();
  }

  async pollOnce(itemId: string): Promise<void> {
    try {
      const sessions = await this.monitor.sessions();
      this.polls += 1;
      const ours = sessions.find((session) => session.NowPlayingItem?.Id === itemId);
      if (ours) this.sawOurSession += 1;
      if (ours?.PlayState?.PlayMethod) this.playMethods.add(ours.PlayState.PlayMethod);
      for (const session of findTranscodingSessions(sessions)) {
        if (!this.transcoding.some((seen) => seen.id === session.id)) this.transcoding.push(session);
      }
    } catch (error) {
      this.errors.push(`/Sessions poll failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async stop(itemId: string): Promise<void> {
    this.running = false;
    await this.loop;
    await this.pollOnce(itemId);
  }
}
