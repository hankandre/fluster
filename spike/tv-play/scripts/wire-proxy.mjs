#!/usr/bin/env node
// Recording reverse proxy for the play falsifier's wire test.
//
//   OCTAVE_UPSTREAM=<server origin> node scripts/wire-proxy.mjs <port> <canaryPort> <outDir> [--redirect-stream]
//
// The upstream is read from the environment and never printed or written. The proxy listens on
// 127.0.0.1 only; `adb reverse` tunnels the device's 127.0.0.1:<port> to it. It streams bodies
// (Range passthrough, no buffering) and records, per request: method, path, query parameter NAMES
// (never values), whether an Authorization header is present and carries a token, the status and
// the byte count. It writes <outDir>/wire.jsonl and, on SIGTERM/SIGINT, <outDir>/verdict.json.
//
// Assertions (verdict.json):
//   - every request carries an Authorization header (MediaBrowser scheme);
//   - every request except the public probe and sign-in carries a token;
//   - no URL has an ApiKey / api_key / token-like parameter, or any token value seen in any header;
//   - zero redirects followed: the probe redirect targets and the canary listener get zero hits;
//   - zero requests for any other origin: every Host header names this proxy;
//   - Jellyscale relayed no 3xx (counted).
// Probe endpoints under /__octave_probe/ are answered here and never forwarded.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const [portArg, canaryArg, outDir, ...flags] = process.argv.slice(2);
const upstreamText = process.env.OCTAVE_UPSTREAM;
if (!portArg || !canaryArg || !outDir || !upstreamText) {
  console.error("usage: OCTAVE_UPSTREAM=<origin> wire-proxy.mjs <port> <canaryPort> <outDir> [--redirect-stream]");
  process.exit(2);
}
const upstream = new URL(upstreamText);
const port = Number(portArg);
const canaryPort = Number(canaryArg);
const redirectStream = flags.includes("--redirect-stream");
fs.mkdirSync(outDir, { recursive: true });
const wire = fs.createWriteStream(path.join(outDir, "wire.jsonl"));

const CREDENTIAL_PARAMS = /^(api_?key|x-emby-token|x-mediabrowser-token|token|access_?token)$/i;
const TOKENLESS_ALLOWED = new Set(["/System/Info/Public", "/Users/AuthenticateByName"]);
const tokens = new Set();
const rawUrls = []; // in memory only, for the end-of-run token scan; never written
const counts = {
  requests: 0, missingAuth: 0, tokenless: 0, tokenlessNotAllowed: 0, credentialParam: 0,
  tokenInUrl: 0, wrongHost: 0, upstream3xx: 0, upstreamErrors: 0, probeRedirectsServed: 0,
  probeTargetHits: 0, probeApiKeyReached: 0, canaryHits: 0, streamRequests: 0, streamBytes: 0,
  status401: 0, injectedStreamRedirects: 0,
};
let seq = 0;
const started = Date.now();

function tokenOf(authorization) {
  return /Token="([^"]+)"/.exec(authorization ?? "")?.[1];
}

function record(entry) {
  wire.write(`${JSON.stringify(entry)}\n`);
}

const server = http.createServer((req, res) => {
  const id = ++seq;
  counts.requests++;
  const url = new URL(req.url, `http://${req.headers.host ?? "missing-host"}`);
  rawUrls.push(req.url);
  const authorization = req.headers.authorization;
  const token = tokenOf(authorization);
  if (token) tokens.add(token);
  const entry = {
    seq: id,
    tMs: Date.now() - started,
    method: req.method,
    path: url.pathname,
    queryNames: [...new Set(url.searchParams.keys())],
    auth: authorization ? (authorization.startsWith("MediaBrowser ") ? "MediaBrowser" : "other") : "none",
    authToken: Boolean(token),
    authClient: /Client="([^"]*)"/.exec(authorization ?? "")?.[1],
    range: Boolean(req.headers.range),
    hostOk: req.headers.host === `127.0.0.1:${port}` || req.headers.host === `localhost:${port}`,
  };
  if (!authorization) counts.missingAuth++;
  if (!token) {
    counts.tokenless++;
    if (!TOKENLESS_ALLOWED.has(url.pathname) && !url.pathname.startsWith("/__octave_probe/")) counts.tokenlessNotAllowed++;
  }
  if (entry.queryNames.some((name) => CREDENTIAL_PARAMS.test(name))) counts.credentialParam++;
  if (!entry.hostOk) counts.wrongHost++;

  const finish = (status, bytes, extra = {}) => {
    if (status === 401) counts.status401++;
    record({ ...entry, status, bytes, ...extra });
  };

  // Probe endpoints, answered locally.
  if (url.pathname.startsWith("/__octave_probe/")) {
    const probe = url.pathname.slice("/__octave_probe/".length);
    if (probe === "redirect-same") {
      counts.probeRedirectsServed++;
      res.writeHead(302, { Location: "/__octave_probe/target-same" }).end();
      return finish(302, 0, { probe });
    }
    if (probe === "redirect-canary") {
      counts.probeRedirectsServed++;
      res.writeHead(302, { Location: `http://127.0.0.1:${canaryPort}/__canary/from-redirect` }).end();
      return finish(302, 0, { probe });
    }
    if (probe === "target-same") counts.probeTargetHits++;
    if (probe === "plain") counts.probeApiKeyReached++;
    res.writeHead(200, { "Content-Type": "text/plain" }).end("probe");
    return finish(200, 5, { probe });
  }

  const isStream = /^\/Videos\/[^/]+\/stream/i.test(url.pathname);
  if (isStream) counts.streamRequests++;
  if (isStream && redirectStream) {
    counts.injectedStreamRedirects++;
    res.writeHead(302, { Location: `http://127.0.0.1:${canaryPort}/__canary/stream` }).end();
    return finish(302, 0, { injected: true });
  }

  const headers = { ...req.headers, host: upstream.host };
  delete headers.connection;
  const upstreamReq = http.request({
    protocol: upstream.protocol,
    hostname: upstream.hostname,
    port: upstream.port || 80,
    method: req.method,
    path: `${url.pathname}${url.search}`,
    headers,
  }, (upstreamRes) => {
    const status = upstreamRes.statusCode ?? 0;
    if (status >= 300 && status < 400) counts.upstream3xx++;
    const outHeaders = { ...upstreamRes.headers };
    res.writeHead(status, outHeaders);
    let bytes = 0;
    upstreamRes.on("data", (chunk) => {
      bytes += chunk.length;
      if (isStream) counts.streamBytes += chunk.length;
    });
    upstreamRes.pipe(res);
    const done = () => {
      finish(status, bytes, isStream ? { contentRange: Boolean(upstreamRes.headers["content-range"]) } : {});
    };
    upstreamRes.on("end", done);
    upstreamRes.on("aborted", () => finish(status, bytes, { aborted: true }));
    res.on("close", () => upstreamRes.destroy());
  });
  upstreamReq.on("error", (error) => {
    counts.upstreamErrors++;
    if (!res.headersSent) res.writeHead(502).end();
    else res.destroy();
    finish(502, 0, { upstreamError: error.code ?? "error" });
  });
  req.on("aborted", () => upstreamReq.destroy());
  req.pipe(upstreamReq);
});

const canary = http.createServer((req, res) => {
  counts.canaryHits++;
  record({ canary: true, tMs: Date.now() - started, method: req.method, path: new URL(req.url, "http://canary").pathname });
  res.writeHead(200).end("canary");
});

function verdict() {
  let tokenInUrl = 0;
  for (const raw of rawUrls) {
    for (const t of tokens) if (raw.includes(t)) tokenInUrl++;
  }
  counts.tokenInUrl = tokenInUrl;
  const checks = {
    everyRequestHasAuthorization: counts.missingAuth === 0,
    tokenOnEveryNonPublicRequest: counts.tokenlessNotAllowed === 0,
    noCredentialInAnyUrl: counts.credentialParam === 0 && tokenInUrl === 0,
    zeroRedirectsFollowed: counts.probeTargetHits === 0 && counts.canaryHits === 0,
    zeroOtherOrigins: counts.wrongHost === 0 && counts.canaryHits === 0,
    apiKeyProbeNeverSent: counts.probeApiKeyReached === 0,
    upstreamRelayedNoRedirect: counts.upstream3xx === 0,
  };
  const pass = Object.values(checks).every(Boolean) && counts.requests > 0;
  return { pass, checks, counts, tokensSeen: tokens.size, redirectStreamMode: redirectStream, durationMs: Date.now() - started };
}

function shutdown() {
  const v = verdict();
  fs.writeFileSync(path.join(outDir, "verdict.json"), `${JSON.stringify(v, null, 2)}\n`);
  console.log(`proxy verdict: ${v.pass ? "PASS" : "FAIL"} ${JSON.stringify(v.checks)}`);
  wire.end(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.listen(port, "127.0.0.1", () => console.log(`proxy listening on 127.0.0.1:${port} (upstream not shown)`));
canary.listen(canaryPort, "127.0.0.1", () => console.log(`canary listening on 127.0.0.1:${canaryPort}`));
