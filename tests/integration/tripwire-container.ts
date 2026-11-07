// Container-side signals for the tripwire: processes and Jellyfin log files,
// read with docker compose exec because the image has no ps or pgrep.
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { classifyProcess } from "./tripwire-rules";

const run = promisify(execFile);
const composeFile = join(dirname(fileURLToPath(import.meta.url)), "docker-compose.yml");
const PROCESS_POLL_MS = 200;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function containerShell(service: string, script: string): Promise<string> {
  const { stdout } = await run("docker", ["compose", "-f", composeFile, "exec", "-T", service, "sh", "-c", script], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

// The image has no ps or pgrep, so read /proc directly.
const LIST_PROCESSES = 'for p in /proc/[0-9]*; do [ -r "$p/cmdline" ] || continue; c=$(tr "\\000" " " < "$p/cmdline" 2>/dev/null); [ -n "$c" ] && echo "${p#/proc/} $c"; done; true';

export async function listProcesses(service: string): Promise<{ pid: string; command: string }[]> {
  const output = await containerShell(service, LIST_PROCESSES);
  return output.split("\n").filter(Boolean).map((line) => {
    const space = line.indexOf(" ");
    return { pid: line.slice(0, space), command: line.slice(space + 1).trim() };
  });
}

async function listLogFiles(service: string): Promise<string[]> {
  const output = await containerShell(service, "ls -1 /config/log");
  return output.split("\n").filter((name) => /^[\w.-]+$/.test(name));
}

async function readLogFile(service: string, name: string): Promise<string> {
  return containerShell(service, `cat "/config/log/${name}"`);
}

// Polls the container's processes until stopped and keeps every ffmpeg and
// ffprobe command line it sees, so short-lived jobs are caught too. A failed
// poll is recorded in errors instead of escaping the loop.
export class ProcessMonitor {
  readonly ffmpeg = new Map<string, string>();
  readonly ffprobe = new Map<string, string>();
  readonly errors: string[] = [];
  polls = 0;
  private running = false;
  private loop?: Promise<void>;

  constructor(private readonly service: string) {}

  start(): void {
    this.ffmpeg.clear();
    this.ffprobe.clear();
    this.errors.length = 0;
    this.polls = 0;
    this.running = true;
    this.loop = (async () => {
      while (this.running) {
        await this.pollOnce();
        await sleep(PROCESS_POLL_MS);
      }
    })();
  }

  async pollOnce(): Promise<void> {
    try {
      for (const process of await listProcesses(this.service)) {
        const kind = classifyProcess(process.command);
        if (kind === "ffmpeg") this.ffmpeg.set(process.pid, process.command);
        if (kind === "ffprobe") this.ffprobe.set(process.pid, process.command);
      }
      this.polls += 1;
    } catch (error) {
      this.errors.push(`process listing failed: ${messageOf(error)}`);
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.loop;
    await this.pollOnce();
  }
}

// Reads only what each log file gained since the last call. It also tracks
// how much the main log_*.log files grew, so a run that cannot see the log
// (wrong directory, no logging) is caught instead of passing blind.
export class LogWatcher {
  private sizes = new Map<string, number>();
  mainLogGrowth = 0;
  mainLogFiles: string[] = [];

  constructor(private readonly service: string) {}

  async baseline(): Promise<void> {
    await this.newContent();
    this.mainLogGrowth = 0;
  }

  async newContent(): Promise<{ text: string; newFiles: string[] }> {
    const names = await listLogFiles(this.service);
    const newFiles = names.filter((name) => !this.sizes.has(name));
    let text = "";
    this.mainLogFiles = names.filter((name) => /^log_.*\.log$/.test(name));
    for (const name of names) {
      const content = await readLogFile(this.service, name);
      const seen = this.sizes.get(name) ?? 0;
      // A rotated or truncated file starts over.
      const added = content.length >= seen ? content.slice(seen) : content;
      if (this.mainLogFiles.includes(name)) this.mainLogGrowth += added.length;
      // A newline keeps a file without a trailing newline from merging into the next.
      text += added + "\n";
      this.sizes.set(name, content.length);
    }
    return { text, newFiles };
  }
}
