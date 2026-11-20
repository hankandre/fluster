#!/usr/bin/env node
// A minimal Jellyfin stand-in for emulator runs: public info, sign-in by name, search, PlaybackInfo
// (one direct-playable file source) and a static stream with Range support. Every route but the
// public info and sign-in demands the issued token in the Authorization header (401 otherwise), as
// Jellyscale does. Listens on 127.0.0.1 only.
//
//   node scripts/mock-jellyfin.mjs <port> <media file>
// User "octave", password from MOCK_PASSWORD (default "mock-only").
import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";

const [portArg, mediaFile] = process.argv.slice(2);
const password = process.env.MOCK_PASSWORD ?? "mock-only";
const port = Number(portArg);
const size = fs.statSync(mediaFile).size;
const token = crypto.randomBytes(16).toString("hex");
const USER_ID = "0f0e0d0c0b0a09080706050403020100";
const ITEM_ID = "00000000000000000000000000000003";
const SOURCE_ID = "00000000000000000000000000000003";
const sessions = new Set();

function tokenOf(req) {
  return /Token="([^"]+)"/.exec(req.headers.authorization ?? "")?.[1];
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => resolve(data ? JSON.parse(data) : {}));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://mock");
  const p = url.pathname;
  if (p === "/System/Info/Public") return json(res, 200, { Version: "12.4.0", ServerName: "mock", Id: "6d6f636b736572766572", ProductName: "Jellyfin Server" });
  if (p === "/Users/AuthenticateByName" && req.method === "POST") {
    const body = await readBody(req);
    if (body.Username !== "octave" || body.Pw !== password) return json(res, 401, {});
    sessions.add(token);
    return json(res, 200, { AccessToken: token, User: { Id: USER_ID, Name: "octave" }, ServerId: "6d6f636b736572766572" });
  }
  if (!sessions.has(tokenOf(req) ?? "")) {
    res.writeHead(401).end();
    return;
  }
  if (p === "/Items" && req.method === "GET") {
    const term = (url.searchParams.get("searchTerm") ?? "").toLowerCase();
    const items = "alien".includes(term) || term.includes("alien")
      ? [{ Id: ITEM_ID, Name: "Alien", Type: "Movie", ProductionYear: 1979, RunTimeTicks: 1_500_000_000 }]
      : [];
    return json(res, 200, { Items: items, TotalRecordCount: items.length });
  }
  const info = /^\/Items\/([^/]+)\/PlaybackInfo$/.exec(p);
  if (info && req.method === "POST") {
    await readBody(req);
    return json(res, 200, {
      PlaySessionId: crypto.randomBytes(16).toString("hex"),
      MediaSources: [{
        Id: SOURCE_ID, Protocol: "File", Path: "/media/movies/Alien (1979)/Alien.mkv", Container: "mkv", Size: size,
        SupportsDirectPlay: true, SupportsDirectStream: true, SupportsTranscoding: true, Bitrate: 7_000_000,
        VideoType: "VideoFile", RequiresOpening: false,
        MediaStreams: [
          { Index: 0, Type: "Video", Codec: "hevc", Profile: "Main 10", Width: 1920, Height: 1080, VideoRange: "HDR", VideoRangeType: "HDR10", DisplayTitle: "1080p HEVC HDR10" },
          { Index: 1, Type: "Audio", Codec: "aac", Channels: 2, Language: "eng", IsDefault: true, DisplayTitle: "English AAC Stereo" },
        ],
        DefaultAudioStreamIndex: 1,
      }],
    });
  }
  const stream = /^\/Videos\/([^/]+)\/stream$/.exec(p);
  if (stream && (req.method === "GET" || req.method === "HEAD")) {
    const q = Object.fromEntries([...url.searchParams].map(([k, v]) => [k.toLowerCase(), v]));
    if (q.static !== "true" || q.mediasourceid !== SOURCE_ID) return json(res, 400, { error: "bad stream params" });
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
    const start = range ? Number(range[1]) : 0;
    const end = range && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    const headers = { "Content-Type": "video/x-matroska", "Accept-Ranges": "bytes", "Content-Length": end - start + 1 };
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    res.writeHead(range ? 206 : 200, headers);
    if (req.method === "HEAD") return res.end();
    return fs.createReadStream(mediaFile, { start, end }).pipe(res);
  }
  return json(res, 404, {});
});

server.listen(port, "127.0.0.1", () => console.log(`mock jellyfin on 127.0.0.1:${port}`));
process.on("SIGTERM", () => process.exit(0));
