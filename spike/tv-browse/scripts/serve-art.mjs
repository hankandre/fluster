// Serves ./art over plain HTTP for the falsifier. No credentials, no logging of clients.
// Usage: node scripts/serve-art.mjs [port]. Bind is 127.0.0.1 by default; reach it from a
// device with `adb reverse tcp:PORT tcp:PORT` so no LAN address is ever baked into the app.
// Set ART_HOST=0.0.0.0 only if adb reverse is unavailable.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "art");
const port = Number(process.argv[2] ?? 8737);
const host = process.env.ART_HOST ?? "127.0.0.1";
let served = 0;

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  // The optimisation pass's arm: FLUSTER_ARM (a JSON object of flags) is served as
  // /config.json, so one APK covers every arm and the arm is chosen per run.
  if (path === "/config.json") {
    const body = process.env.FLUSTER_ARM ?? "{}";
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(body);
    return;
  }
  const file = join(root, path);
  if (!file.startsWith(root) || !file.endsWith(".jpg")) {
    res.writeHead(404).end();
    return;
  }
  try {
    const { size } = statSync(file);
    res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": size, "Cache-Control": "max-age=86400" });
    createReadStream(file).pipe(res);
    served += 1;
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, host, () => console.log(`art server on ${host}:${port}`));

process.on("SIGINT", () => {
  console.log(`served ${served} images`);
  process.exit(0);
});
process.on("SIGTERM", () => {
  console.log(`served ${served} images`);
  process.exit(0);
});
