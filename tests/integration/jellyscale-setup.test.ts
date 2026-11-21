import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// T2-08 item 3, the Jellyscale branch of setup-servers.sh (OCTAVE_SETUP_ONLY=jellyscale), run against a fake
// curl and sleep on PATH. No server, no Docker. The fake answers /readyz, sign-in and /Items, and appends the
// Authorization header it was given to a log, so the test can see the token travel by header and not by output.
const here = dirname(fileURLToPath(import.meta.url));
const password = "0123456789abcdef0123456789abcdef";
const token = "tok0123456789abcdeftok0123456789ab";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const fakeCurl = `#!/usr/bin/env bash
url=""; header_file=""; prev=""
for arg in "$@"; do
  case "$arg" in http*) url="$arg" ;; esac
  if [ "$prev" = "-H" ] && [ "\${arg#@}" != "$arg" ]; then header_file="\${arg#@}"; fi
  prev="$arg"
done
case "$url" in
  */readyz) exit 0 ;;
  */Users/AuthenticateByName)
    cat > /dev/null
    if [ -n "\${FAKE_NO_TOKEN:-}" ]; then echo '{}'; else echo '{"AccessToken":"${token}"}'; fi ;;
  */Items)
    if [ -n "$header_file" ]; then cat "$header_file" >> "$FAKE_LOG"; fi
    echo '{"TotalRecordCount":3,"Items":[{"Type":"Movie","Name":"Synthetic H264"},{"Type":"Series","Name":"Synthetic Show"},{"Type":"Episode","Name":"Pilot"}]}' ;;
  *) echo "unexpected $url" >&2; exit 22 ;;
esac
`;

function run(options: { noToken?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "octave-setup-"));
  dirs.push(dir);
  const bin = join(dir, "bin");
  const work = join(dir, "work");
  spawnSync("mkdir", ["-p", bin, work]);
  writeFileSync(join(bin, "curl"), fakeCurl);
  writeFileSync(join(bin, "sleep"), "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(join(bin, "curl"), 0o755);
  chmodSync(join(bin, "sleep"), 0o755);
  copyFileSync(join(here, "setup-servers.sh"), join(work, "setup-servers.sh"));
  writeFileSync(join(work, ".jellyscale.env"), `JELLYSCALE_ADMIN_PASSWORD=${password}\n`, { mode: 0o600 });
  const log = join(dir, "curl.log");
  const result = spawnSync("bash", [join(work, "setup-servers.sh")], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      OCTAVE_SETUP_ONLY: "jellyscale",
      FAKE_LOG: log,
      ...(options.noToken ? { FAKE_NO_TOKEN: "1" } : {}),
    },
  });
  return { result, work, log };
}

describe("T2-08 item 3: the Jellyscale branch of setup-servers.sh", () => {
  it("signs in, waits for the scan, saves the credentials at mode 600, and prints no password or token", () => {
    const { result, work, log } = run();
    expect(result.status, result.stderr).toBe(0);
    const credentials = join(work, ".credentials");
    expect(statSync(credentials).mode & 0o777).toBe(0o600);
    const text = readFileSync(credentials, "utf8");
    expect(text).toContain("jellyscale_url=http://127.0.0.1:18098");
    expect(text).toContain("jellyscale_username=octave-test");
    expect(text).toContain(`jellyscale_password=${password}`);
    const output = result.stdout + result.stderr;
    expect(output).toContain("scan done");
    expect(output).not.toContain(password);
    expect(output).not.toContain(token);
    // The token reached the server in the Authorization header, and only there.
    expect(readFileSync(log, "utf8")).toContain(`Token="${token}"`);
  });

  it("fails with a plain message and saves nothing when sign-in returns no token", () => {
    const { result, work } = run({ noToken: true });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Jellyscale refused octave-test");
    expect(result.stdout + result.stderr).not.toContain(password);
    expect(existsSync(join(work, ".credentials"))).toBe(false);
  });
});
