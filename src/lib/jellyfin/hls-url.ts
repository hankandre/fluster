// Rebuilds a server-supplied TranscodingUrl by the HLS URL rules
// (ARCHITECTURE.md §3, decision 0002). The original is never followed,
// logged, or returned: only the rebuilt URL leaves this module.
//
// Rust re-checks the result (`validate_master_url`,
// src-tauri/src/player/hls/master_url.rs), so the two must agree: the same
// path shape, no credential parameter, exactly one `EnableTrickplay=false`,
// no `EnableSubtitlesInManifest`, and no `SubtitleMethod=Hls`.
import { isCredentialQueryName } from "./credential-query";

export type HlsMediaKind = "videos" | "audio";

export type HlsUrlResult =
  | { ok: true; url: string; kind: HlsMediaKind; params: URLSearchParams }
  | { ok: false; detail: string };

export interface HlsUrlContext {
  // The normalized signed-in server URL, without a trailing slash.
  serverUrl: string;
  itemId: string;
  mediaSourceId: string;
  // `videos` for any source with video; `audio` only for audio-only sources.
  mediaKind: HlsMediaKind;
  // The PlaybackInfo answer's PlaySessionId; a URL naming another is refused.
  playSessionId?: string;
}

const MASTER_PATH = /^\/(videos|audio)\/([^/]+)\/master\.m3u8$/i;
const ITEM_ID = /^[0-9a-z-]+$/i;
// Whitespace or control characters in a name could hide a credential name
// from a parser that trims differently, so such a name is refused.
const UNSAFE_NAME = /[\s\p{Cc}]/u;
// SubtitleDeliveryMethod values Fluster accepts by name. Hls, numeric enum
// values, and anything else are refused.
const SUBTITLE_METHODS = new Set(["encode", "embed", "external", "drop"]);

function normalizedId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

function refuse(detail: string): HlsUrlResult {
  return { ok: false, detail };
}

// A relative TranscodingUrl ("/videos/…") is relative to the server URL,
// including any base path, as the static stream URL is.
function resolve(transcodingUrl: string, serverUrl: string): URL | undefined {
  try {
    const relative = transcodingUrl.startsWith("/") && !transcodingUrl.startsWith("//");
    return relative ? new URL(`${serverUrl}${transcodingUrl}`) : new URL(transcodingUrl);
  } catch {
    return undefined;
  }
}

export function rebuildMasterUrl(transcodingUrl: string, context: HlsUrlContext): HlsUrlResult {
  const server = new URL(context.serverUrl);
  const url = resolve(transcodingUrl.trim(), context.serverUrl);
  if (!url) return refuse("unparsable");
  if (url.protocol !== "http:" && url.protocol !== "https:") return refuse("scheme");
  if (url.username || url.password) return refuse("user info");
  if (url.origin !== server.origin) return refuse("other origin");

  const basePath = server.pathname.replace(/\/+$/, "");
  if (basePath && !url.pathname.startsWith(`${basePath}/`)) return refuse("path");
  const match = MASTER_PATH.exec(url.pathname.slice(basePath.length));
  if (!match) return refuse("path");
  const [, kind, id] = match;
  if (!ITEM_ID.test(id) || !context.itemId || normalizedId(id) !== normalizedId(context.itemId)) {
    return refuse("item");
  }
  if (kind.toLowerCase() !== context.mediaKind) return refuse("media type");

  const params = new URLSearchParams();
  let mediaSourceIds = 0;
  for (const [name, value] of url.searchParams) {
    if (UNSAFE_NAME.test(name)) return refuse("parameter name");
    const lower = name.toLowerCase();
    if (isCredentialQueryName(name) || lower === "enabletrickplay") continue;
    if (lower === "enablesubtitlesinmanifest") {
      // The server would list subtitle playlists that carry ApiKey (decision 0002 Q1).
      if (value.toLowerCase() !== "false") return refuse("subtitles in manifest");
      continue;
    }
    if (lower === "subtitlemethod") {
      const method = value.trim().toLowerCase();
      if (method === "hls") return refuse("HLS subtitles");
      if (!SUBTITLE_METHODS.has(method)) return refuse("subtitle method");
    }
    if (lower === "mediasourceid") {
      if (normalizedId(value) !== normalizedId(context.mediaSourceId)) return refuse("media source");
      mediaSourceIds += 1;
    }
    if (lower === "playsessionid" && context.playSessionId !== undefined && value !== context.playSessionId) {
      return refuse("play session");
    }
    params.append(name, value);
  }
  // The server's job and the plan's reports must name the same source.
  if (mediaSourceIds !== 1) return refuse("media source");
  // The server defaults EnableTrickplay to true on master.m3u8 and then lists
  // trickplay playlists with ApiKey={token} (DynamicHlsController.cs v10.11.7 line 464).
  params.append("EnableTrickplay", "false");

  const rebuilt = new URL(url.pathname, server.origin);
  rebuilt.search = params.toString();
  return { ok: true, url: rebuilt.toString(), kind: kind.toLowerCase() as HlsMediaKind, params };
}
