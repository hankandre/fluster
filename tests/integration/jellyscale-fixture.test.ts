import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// T2-08: the pinned Jellyscale fixture server beside the two Jellyfin ones. These tests read the compose file as
// text (no YAML dependency, no Docker: CI's checks job has neither) and run the two small scripts in a temp dir.
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const composePath = join(here, "docker-compose.yml");
const configPath = join(here, "jellyscale-config.json");
const read = (path: string): string => readFileSync(path, "utf8");

// The lines of one top-level service: from "  <name>:" to the next two-space key.
function serviceBlock(compose: string, name: string): string {
  const lines = compose.split("\n");
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start === -1) throw new Error(`no ${name} service in docker-compose.yml`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {0,2}\S/.test(line));
  return rest.slice(0, end === -1 ? undefined : end).join("\n");
}

function pin(compose: string): string {
  const match = /^x-jellyscale-commit:\s*([^\s#]+)/m.exec(compose);
  if (!match) throw new Error("docker-compose.yml has no x-jellyscale-commit");
  return match[1];
}

const temps: string[] = [];
afterEach(() => {
  while (temps.length > 0) rmSync(temps.pop()!, { recursive: true, force: true });
});
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "octave-t208-"));
  temps.push(dir);
  return dir;
}

describe("T2-08 item 1: one command starts all three pinned servers", () => {
  it("defines both Jellyfin services, Jellyscale and its database", () => {
    const compose = read(composePath);
    for (const name of ["jellyfin-10-11", "jellyfin-12", "jellyscale", "jellyscale-db"]) {
      expect(() => serviceBlock(compose, name), name).not.toThrow();
    }
    expect(serviceBlock(compose, "jellyfin-10-11")).toContain("jellyfin/jellyfin:10.11");
    expect(serviceBlock(compose, "jellyfin-12")).toContain("jellyfin/jellyfin:12.4");
  });

  it("mounts the generated samples read-only at /media in all three servers", () => {
    const compose = read(composePath);
    for (const name of ["jellyfin-10-11", "jellyfin-12", "jellyscale"]) {
      expect(serviceBlock(compose, name), name).toMatch(/\.\.\/samples:\/media:ro/);
    }
  });

  it("builds Jellyscale from the pinned commit and publishes it on loopback port 18098", () => {
    const block = serviceBlock(read(composePath), "jellyscale");
    expect(block).toMatch(/target:\s*server/);
    expect(block).toMatch(/127\.0\.0\.1:18098:8096/);
    expect(block).toMatch(/\.jellyscale\.env/);
  });

  it("starts Jellyscale only after its database is healthy", () => {
    const block = serviceBlock(read(composePath), "jellyscale");
    expect(block).toMatch(/jellyscale-db/);
    expect(block).toMatch(/service_healthy/);
  });

  it("points the committed config's Movies and Shows libraries at /media/movies and /media/shows", () => {
    const config = JSON.parse(read(configPath)) as Record<string, unknown>;
    expect(Object.keys(config).sort()).toEqual(["adminUser", "libraries", "name", "transcodeStore"]);
    expect(config.adminUser).toBe("octave-test");
    const libraries = config.libraries as Record<string, unknown>[];
    expect(Array.isArray(libraries)).toBe(true);
    const valuesOf = (entry: Record<string, unknown>): unknown[] => Object.values(entry);
    const movies = libraries.find((entry) => valuesOf(entry).includes("file:///media/movies"));
    const shows = libraries.find((entry) => valuesOf(entry).includes("file:///media/shows"));
    expect(valuesOf(movies ?? {})).toContain("movies");
    expect(valuesOf(shows ?? {})).toContain("tvshows");
  });

  it("makes pnpm fixture:up run fixture-up.sh and adds fixture:check-jellyscale", () => {
    const scripts = (JSON.parse(read(join(root, "package.json"))) as { scripts: Record<string, string> }).scripts;
    expect(scripts["fixture:up"]).toBe("bash tests/integration/fixture-up.sh");
    expect(scripts["fixture:check-jellyscale"]).toBe("tsx tests/integration/record-jellyscale-fixtures.ts --check");
    expect(existsSync(join(here, "fixture-up.sh"))).toBe(true);
    expect(read(join(here, "fixture-up.sh"))).toMatch(/docker compose[^\n]*up -d --wait/);
  });
});

describe("T2-08 item 2: the pin is a commit or digest, and nothing private is committed", () => {
  it("keeps the pin in x-jellyscale-commit as 40 lowercase hex characters", () => {
    expect(pin(read(composePath))).toMatch(/^[0-9a-f]{40}$/);
  });

  it("agrees on the pin in the build context, REVISION, the image tag and the fixtures folder", () => {
    const compose = read(composePath);
    const sha = pin(compose);
    const block = serviceBlock(compose, "jellyscale");
    const context = /context:\s*(\S+)/.exec(block)?.[1] ?? "";
    expect(context).toContain("github.com/jellyscale-org/jellyscale.git");
    if (context.includes("#")) expect(context.split("#")[1]).toBe(sha);
    expect(/REVISION:\s*["']?([0-9a-f]+)/.exec(block)?.[1]).toBe(sha);
    expect(/image:\s*octave-jellyscale:(\S+)/.exec(block)?.[1]).toBe(sha.slice(0, 12));
    const folders = readdirSync(join(root, "packages/core/tests/fixtures/jellyscale"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(folders).toEqual([sha.slice(0, 12)]);
  });

  it("pins Postgres by digest", () => {
    expect(serviceBlock(read(composePath), "jellyscale-db")).toMatch(/image:\s*postgres:\S+@sha256:[0-9a-f]{64}/);
  });

  it("holds no credential, no private address and no loose port in the compose file or the config", () => {
    for (const path of [composePath, configPath]) {
      const text = read(path);
      expect(text, path).not.toMatch(/PASSWORD\s*[:=]\s*[^\s#]/);
      expect(text, path).not.toMatch(/\bPw\b/);
      for (const match of text.matchAll(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g)) expect(match[0], path).toBe("127.0.0.1");
    }
    const compose = read(composePath);
    const published = serviceBlock(compose, "jellyscale").split("\n");
    const portsAt = published.findIndex((line) => /^\s+ports:/.test(line));
    expect(portsAt).toBeGreaterThan(-1);
    for (const line of published.slice(portsAt).filter((entry) => /\d+:\d+/.test(entry))) {
      expect(line).toMatch(/127\.0\.0\.1:\d+:\d+/);
    }
    expect(serviceBlock(compose, "jellyscale-db")).not.toMatch(/^\s+ports:/m);
  });

  it("ignores the generated password file and the credentials file in git", () => {
    const lines = read(join(root, ".gitignore")).split("\n").map((line) => line.trim());
    expect(lines).toContain("tests/integration/.jellyscale.env");
    expect(lines).toContain("tests/integration/.credentials");
  });
});

describe("T2-08 item 3: the setup path creates the test user and prints nothing secret", () => {
  function runUp(dir: string) {
    return spawnSync("bash", [join(dir, "fixture-up.sh"), "--env-only"], {
      encoding: "utf8",
      env: { ...process.env, OCTAVE_FIXTURE_DIR: dir },
    });
  }
  function installScript(): string {
    const dir = tempDir();
    copyFileSync(join(here, "fixture-up.sh"), join(dir, "fixture-up.sh"));
    return dir;
  }

  it("fixture-up.sh --env-only writes a mode-600 env file holding a 32-hex password and prints none of it", () => {
    const dir = installScript();
    const result = runUp(dir);
    expect(result.status, result.stderr).toBe(0);
    const file = join(dir, ".jellyscale.env");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const value = /^JELLYSCALE_ADMIN_PASSWORD=([0-9a-f]{32})$/m.exec(read(file))?.[1];
    expect(value).toBeDefined();
    expect(result.stdout + result.stderr).not.toContain(value!);
  });

  it("fixture-up.sh --env-only keeps the file as it is on a second run", () => {
    const dir = installScript();
    expect(runUp(dir).status).toBe(0);
    const first = read(join(dir, ".jellyscale.env"));
    expect(runUp(dir).status).toBe(0);
    expect(read(join(dir, ".jellyscale.env"))).toBe(first);
  });

  describe("check-no-secret.mjs", () => {
    const script = join(here, "check-no-secret.mjs");
    const passwordValue = "0123456789abcdef0123456789abcdef";
    const adminValue = "fedcba9876543210fedcba9876543210";

    function filter(input: string) {
      const dir = tempDir();
      writeFileSync(
        join(dir, ".credentials"),
        `jellyfin-12_url=http://127.0.0.1:18097\njellyfin-12_username=octave-test\njellyfin-12_password=${passwordValue}\n`,
      );
      writeFileSync(join(dir, ".jellyscale.env"), `JELLYSCALE_ADMIN_PASSWORD=${adminValue}\n`);
      return spawnSync(process.execPath, [script], { input, encoding: "utf8", env: { ...process.env, OCTAVE_FIXTURE_DIR: dir } });
    }

    it("exits 1 and names only the key when a _password value appears", () => {
      const result = filter(`[setup] signed in with ${passwordValue}\n`);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("jellyfin-12_password");
      expect(result.stderr).not.toContain(passwordValue);
    });

    it("exits 1 and names only the key when the Jellyscale admin password appears", () => {
      const result = filter(`token for ${adminValue}\n`);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("JELLYSCALE_ADMIN_PASSWORD");
      expect(result.stderr).not.toContain(adminValue);
    });

    it("passes URLs and user names through and exits 0", () => {
      const input = "[setup] jellyscale http://127.0.0.1:18098 user octave-test, 7 items\n";
      const result = filter(input);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(input);
    });
  });
});
