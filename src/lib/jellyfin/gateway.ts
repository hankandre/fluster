import { Jellyfin, type Api } from "@jellyfin/sdk";
import axios from "axios";
import type { BrowseCard, BrowsePage, BrowseQuery, CardImageType, EpisodeCard, LibraryItem, LibraryView, MediaCard, SearchHint, SearchPage, SearchQuery, Season } from "../../domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot } from "../../domain/playback";
import { secondsToTicks } from "../../domain/playback";
import { isSupportedServerVersion, parseServerVersion } from "../../domain/server-version";
import { getInstallId } from "../install-id";
import { redactError, redactText } from "../redact";
import { toBrowseCards, toEpisodeCards, toHomeLibraries, toMediaCards, toSearchCards, toSearchHints, toSeasons } from "./cards";
import { deriveDeviceId } from "./device-id";
import type {
  AuthenticationResult,
  BaseItemDto,
  HttpRequestConfig,
  HttpTransport,
  ItemsResult,
  MediaSourceDto,
  PlaybackInfoResponse,
  QuickConnectResult,
  SearchHintResult,
  ServerInfo,
} from "./types";

export const CONTROL_REQUEST_TIMEOUT_MS = 15_000;
export const REPORT_REQUEST_TIMEOUT_MS = 3_000;

export const HOME_ROW_LIMIT = 16;
// The only ItemFields a card needs. ProductionYear and RunTimeTicks are
// always returned and are not valid values here.
const CARD_FIELDS = "PrimaryImageAspectRatio";
const CARD_IMAGE_PARAMS = {
  fields: CARD_FIELDS,
  imageTypeLimit: 1,
  enableImageTypes: "Primary,Backdrop",
};

const SEARCH_HINT_LIMIT = 8;
const SEARCH_TYPES = "Movie,Series,Episode";

const DEVICE_NAME = "Fluster Linux";
// Jellyfin binds the Quick Connect token to the DeviceId sent with Initiate
// (QuickConnectManager.cs:72-93, 154-163), before any user is known, so a
// per-user id is impossible. The placeholder contains "#", which Jellyfin
// rejects in usernames (UserManager.cs:119), so no real user can collide.
const QUICK_CONNECT_DEVICE_USER = "#quick-connect";

function createClient(deviceId: string): Jellyfin {
  return new Jellyfin({
    clientInfo: { name: "Fluster", version: "0.1.0" },
    deviceInfo: { name: DEVICE_NAME, id: deviceId },
  });
}

function buildAuthorizationHeader(serverUrl: string, deviceId: string, accessToken?: string): string {
  return createClient(deviceId).createApi(serverUrl, accessToken).authorizationHeader;
}

function createSdkApi(serverUrl: string, deviceId: string, accessToken?: string): Api {
  // The SDK's generated APIs apply basePath and authorization through their
  // Configuration object. Fluster's narrow gateway uses the raw Axios client,
  // so it must provide those values on an isolated instance explicitly.
  const axiosInstance = axios.create({
    baseURL: serverUrl,
    timeout: CONTROL_REQUEST_TIMEOUT_MS,
  });
  const api = createClient(deviceId).createApi(serverUrl, accessToken, axiosInstance);
  axiosInstance.defaults.headers.common.Authorization = api.authorizationHeader;
  return api;
}

export const DIRECT_PLAY_REQUEST = Object.freeze({
  EnableDirectPlay: true,
  EnableDirectStream: false,
  EnableTranscoding: false,
  AllowVideoStreamCopy: false,
  AllowAudioStreamCopy: false,
  AutoOpenLiveStream: false,
});

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function normalizeServerUrl(input: string): string {
  const candidate = input.trim();
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Enter a valid Jellyfin server URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The server URL must use http:// or https://.");
  }
  if (url.username || url.password) {
    throw new Error("The server URL must not include a username or password.");
  }
  if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
    throw new Error("Remote Jellyfin servers must use HTTPS. HTTP is allowed only for this device's loopback address.");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

export function selectDirectFileSource(sources: MediaSourceDto[] | undefined): MediaSourceDto {
  const source = sources?.find(
    (candidate) =>
      Boolean(candidate.Id && candidate.Path) &&
      candidate.SupportsDirectPlay === true &&
      !candidate.TranscodingUrl &&
      candidate.Protocol !== "Http",
  );
  if (!source) {
    throw new Error("No static, file-backed direct-play source is available. Server conversion is disabled.");
  }
  return source;
}

export function buildStaticStreamUrl(
  serverUrl: string,
  itemId: string,
  mediaSourceId: string,
  playSessionId: string,
  accessToken: string,
): string {
  const url = new URL(`${serverUrl}/Videos/${encodeURIComponent(itemId)}/stream`);
  url.searchParams.set("Static", "true");
  url.searchParams.set("MediaSourceId", mediaSourceId);
  url.searchParams.set("PlaySessionId", playSessionId);
  url.searchParams.set("api_key", accessToken);
  return url.toString();
}

function hasCredentialQuery(url: URL): boolean {
  const credentialNames = new Set(["access_token", "api_key", "token", "x-emby-token"]);
  return [...url.searchParams.keys()].some((name) => credentialNames.has(name.toLowerCase()));
}

function buildAuthenticatedResourceUrl(serverUrl: string, path: string | null | undefined, accessToken: string): string | undefined {
  if (!path) return undefined;
  let url: URL;
  try {
    url = new URL(path, `${serverUrl}/`);
  } catch {
    throw new Error("Jellyfin returned an invalid external subtitle URL.");
  }
  const serverOrigin = new URL(serverUrl).origin;
  const safeProtocol = url.protocol === "http:" || url.protocol === "https:";
  const hasCredentials = Boolean(url.username || url.password) || hasCredentialQuery(url);
  if (!safeProtocol || url.origin !== serverOrigin || hasCredentials) {
    throw new Error("Jellyfin returned an unsafe external subtitle URL. Subtitle URLs must use the same server origin and must not contain credentials.");
  }
  url.hash = "";
  url.searchParams.set("api_key", accessToken);
  return url.toString();
}

export class JellyfinGateway {
  readonly serverUrl: string;
  private transport: HttpTransport;
  private api?: Api;
  private accessToken?: string;
  private userId?: string;
  private serverId?: string;
  private deviceId?: string;

  constructor(
    serverUrl: string,
    transport?: HttpTransport,
    private readonly installId: string = getInstallId(),
  ) {
    this.serverUrl = normalizeServerUrl(serverUrl);
    // Before login there is no user, so the unauthenticated API uses a
    // throwaway device id that is never sent with credentials.
    this.api = transport ? undefined : createSdkApi(this.serverUrl, "fluster-unauthenticated");
    this.transport = transport ?? (this.api!.axiosInstance as HttpTransport);
  }

  async connect(signal?: AbortSignal): Promise<{ name: string; version: string }> {
    const { data } = await this.get<ServerInfo>("/System/Info/Public", {
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    if (!data || typeof data !== "object" || typeof data.Version !== "string") {
      throw new Error("The server returned an unexpected public-info response. Check the URL and reverse-proxy routing.");
    }
    const version = data.Version;
    const parsed = parseServerVersion(version);
    if (!parsed || !isSupportedServerVersion(parsed)) {
      throw new Error(`Fluster needs Jellyfin 10.11 or newer; this server reports ${version}.`);
    }
    this.serverId = data.Id;
    return { name: data.ServerName ?? "Jellyfin", version };
  }

  async login(username: string, password: string, signal?: AbortSignal): Promise<{ userId: string; username: string }> {
    // Fall back to the server URL if connect() did not provide a server id.
    const deviceId = await deriveDeviceId(this.installId, this.serverId ?? this.serverUrl, username);
    const { data } = await this.post<AuthenticationResult>("/Users/AuthenticateByName", {
      Username: username,
      Pw: password,
    }, {
      headers: { Authorization: buildAuthorizationHeader(this.serverUrl, deviceId) },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    return this.startSession(data, deviceId, username);
  }

  async quickConnectEnabled(signal?: AbortSignal): Promise<boolean> {
    const { data } = await this.get<boolean>("/QuickConnect/Enabled", {
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    return data === true;
  }

  // POST, not GET: Jellyfin 12 removed the GET form of this endpoint.
  async initiateQuickConnect(signal?: AbortSignal): Promise<{ secret: string; code: string }> {
    const deviceId = await this.quickConnectDeviceId();
    const { data } = await this.post<QuickConnectResult>("/QuickConnect/Initiate", undefined, {
      headers: { Authorization: buildAuthorizationHeader(this.serverUrl, deviceId) },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    if (!data?.Secret || !data.Code) throw new Error("Jellyfin did not return a Quick Connect code.");
    return { secret: data.Secret, code: data.Code };
  }

  // The API requires the secret in the query string. It is not the access
  // token, but errors still go through redaction, which covers `secret`.
  async pollQuickConnect(secret: string, signal?: AbortSignal): Promise<{ authenticated: boolean }> {
    const deviceId = await this.quickConnectDeviceId();
    const { data } = await this.get<QuickConnectResult>("/QuickConnect/Connect", {
      params: { secret },
      headers: { Authorization: buildAuthorizationHeader(this.serverUrl, deviceId) },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    return { authenticated: data?.Authenticated === true };
  }

  async authenticateWithQuickConnect(secret: string, signal?: AbortSignal): Promise<{ userId: string; username: string }> {
    const deviceId = await this.quickConnectDeviceId();
    const { data } = await this.post<AuthenticationResult>("/Users/AuthenticateWithQuickConnect", {
      Secret: secret,
    }, {
      headers: { Authorization: buildAuthorizationHeader(this.serverUrl, deviceId) },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    return this.startSession(data, deviceId, "Jellyfin user");
  }

  // Quick Connect has no username before approval, so its device id is derived
  // with a fixed placeholder. The id stays stable per install and server, and
  // it is the DeviceId the server binds the new token to.
  private quickConnectDeviceId(): Promise<string> {
    return deriveDeviceId(this.installId, this.serverId ?? this.serverUrl, QUICK_CONNECT_DEVICE_USER);
  }

  private startSession(
    data: AuthenticationResult,
    deviceId: string,
    fallbackName: string,
  ): { userId: string; username: string } {
    if (!data.AccessToken || !data.User?.Id) throw new Error("Jellyfin did not return a valid user session.");
    this.accessToken = data.AccessToken;
    this.userId = data.User.Id;
    this.deviceId = deviceId;
    if (this.api) {
      this.api = createSdkApi(this.serverUrl, deviceId, data.AccessToken);
      this.transport = this.api.axiosInstance as HttpTransport;
    }
    return { userId: data.User.Id, username: data.User.Name ?? fallbackName };
  }

  async logout(): Promise<void> {
    const { accessToken, deviceId } = this;
    // Clear local state first so the UI can never keep a revoked token.
    this.accessToken = undefined;
    this.userId = undefined;
    this.deviceId = undefined;
    const transport = this.transport;
    if (this.api) {
      this.api = createSdkApi(this.serverUrl, "fluster-unauthenticated");
      this.transport = this.api.axiosInstance as HttpTransport;
    }
    if (!accessToken || !deviceId) return;
    try {
      await transport.post("/Sessions/Logout", undefined, {
        headers: { Authorization: buildAuthorizationHeader(this.serverUrl, deviceId, accessToken) },
        timeout: REPORT_REQUEST_TIMEOUT_MS,
      });
    } catch (error) {
      console.warn("Server logout failed; the local session was cleared.", error instanceof Error ? redactText(error.message) : "unknown error");
    }
  }

  async latest(signal?: AbortSignal): Promise<LibraryItem[]> {
    this.requireSession();
    const { data } = await this.get<{ Items?: BaseItemDto[] }>("/Items", {
      params: {
        userId: this.userId,
        Recursive: true,
        IncludeItemTypes: "Movie,Episode",
        SortBy: "DateCreated",
        SortOrder: "Descending",
        Limit: 10,
        Fields: "Overview",
        EnableUserData: true,
      },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    return (data.Items ?? []).flatMap((item) => {
      if (!item.Id || !item.Name || (item.Type !== "Movie" && item.Type !== "Episode")) return [];
      return [{
        id: item.Id,
        name: item.Name,
        type: item.Type,
        seriesName: item.SeriesName,
        season: item.ParentIndexNumber,
        episode: item.IndexNumber,
        productionYear: item.ProductionYear,
        runTimeTicks: item.RunTimeTicks,
        overview: item.Overview,
        resumePositionTicks: Math.max(0, item.UserData?.PlaybackPositionTicks ?? 0),
        played: Boolean(item.UserData?.Played),
      } satisfies LibraryItem];
    }).slice(0, 10);
  }

  async userViews(signal?: AbortSignal): Promise<LibraryView[]> {
    const { userId } = this.requireSession();
    const { data } = await this.get<ItemsResult>("/UserViews", {
      params: { userId },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    return toHomeLibraries(data.Items);
  }

  async resumeItems(signal?: AbortSignal): Promise<MediaCard[]> {
    const { userId } = this.requireSession();
    const { data } = await this.get<ItemsResult>("/UserItems/Resume", {
      params: {
        userId,
        mediaTypes: "Video",
        limit: HOME_ROW_LIMIT,
        enableUserData: true,
        enableTotalRecordCount: false,
        ...CARD_IMAGE_PARAMS,
      },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    return toMediaCards(data.Items);
  }

  async nextUp(signal?: AbortSignal): Promise<MediaCard[]> {
    const { userId } = this.requireSession();
    const { data } = await this.get<ItemsResult>("/Shows/NextUp", {
      params: {
        userId,
        limit: HOME_ROW_LIMIT,
        enableRewatching: false,
        enableTotalRecordCount: false,
        ...CARD_IMAGE_PARAMS,
      },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    return toMediaCards(data.Items);
  }

  // Unlike the other home calls, /Items/Latest returns a bare array.
  async latestInLibrary(parentId: string, signal?: AbortSignal): Promise<MediaCard[]> {
    const { userId } = this.requireSession();
    const { data } = await this.get<BaseItemDto[]>("/Items/Latest", {
      params: {
        userId,
        parentId,
        limit: HOME_ROW_LIMIT,
        groupItems: true,
        ...CARD_IMAGE_PARAMS,
      },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    return toMediaCards(data);
  }

  // Lists a library or collection page. Instead of asking the server for a
  // total count, it fetches one extra item to learn whether more pages exist.
  async libraryItems(parentId: string, query: BrowseQuery, signal?: AbortSignal): Promise<BrowsePage> {
    const { userId } = this.requireSession();
    const params: Record<string, unknown> = {
      userId,
      parentId,
      recursive: true,
      includeItemTypes: query.itemTypes.join(","),
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      startIndex: query.startIndex,
      limit: query.limit + 1,
      enableUserData: true,
      enableTotalRecordCount: false,
      ...CARD_IMAGE_PARAMS,
    };
    if (query.filters.length > 0) params.filters = query.filters.join(",");
    const { data } = await this.get<ItemsResult>("/Items", {
      params,
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    // Page from the raw list, so items dropped while converting cannot hide
    // later pages or repeat across a page boundary.
    const rawItems = data.Items ?? [];
    const cards: BrowseCard[] = toBrowseCards(rawItems.slice(0, query.limit));
    return { cards, hasMore: rawItems.length > query.limit };
  }

  // Type-ahead suggestions. The hints DTO is lighter than a full item list.
  async searchHints(term: string, signal?: AbortSignal): Promise<SearchHint[]> {
    const { userId } = this.requireSession();
    const { data } = await this.get<SearchHintResult>("/Search/Hints", {
      params: { userId, searchTerm: term, limit: SEARCH_HINT_LIMIT, includeItemTypes: SEARCH_TYPES },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    return toSearchHints(data.SearchHints);
  }

  // Result pages use /Items?searchTerm. Like libraryItems, it fetches one
  // extra item to learn whether another page exists.
  async searchItems(term: string, query: SearchQuery, signal?: AbortSignal): Promise<SearchPage> {
    const { userId } = this.requireSession();
    const { data } = await this.get<ItemsResult>("/Items", {
      params: {
        userId,
        searchTerm: term,
        recursive: true,
        includeItemTypes: SEARCH_TYPES,
        startIndex: query.startIndex,
        limit: query.limit + 1,
        enableUserData: true,
        enableTotalRecordCount: false,
        ...CARD_IMAGE_PARAMS,
      },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    const rawItems = data.Items ?? [];
    return { cards: toSearchCards(rawItems.slice(0, query.limit)), hasMore: rawItems.length > query.limit };
  }

  async seasons(seriesId: string, signal?: AbortSignal): Promise<Season[]> {
    const { userId } = this.requireSession();
    const { data } = await this.get<ItemsResult>(`/Shows/${encodeURIComponent(seriesId)}/Seasons`, {
      params: { userId, fields: CARD_FIELDS },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    return toSeasons(data.Items);
  }

  async episodes(seriesId: string, seasonId: string, signal?: AbortSignal): Promise<EpisodeCard[]> {
    const { userId } = this.requireSession();
    const { data } = await this.get<ItemsResult>(`/Shows/${encodeURIComponent(seriesId)}/Episodes`, {
      params: { userId, seasonId, fields: "Overview,PrimaryImageAspectRatio", enableUserData: true },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    return toEpisodeCards(data.Items);
  }

  // Tagged image URLs are immutable and need no token, so they carry no
  // credentials and can be cached by (item, type, tag, size).
  imageUrl(itemId: string, type: CardImageType, tag: string, maxWidth: number): string {
    const url = new URL(`${this.serverUrl}/Items/${encodeURIComponent(itemId)}/Images/${type}`);
    url.searchParams.set("tag", tag);
    url.searchParams.set("maxWidth", String(maxWidth));
    url.searchParams.set("quality", "90");
    url.searchParams.set("format", "Webp");
    return url.toString();
  }

  async createPlaybackPlan(item: LibraryItem, startPositionTicks = 0, signal?: AbortSignal): Promise<PlaybackPlan> {
    const { accessToken, userId } = this.requireSession();
    const request = { ...DIRECT_PLAY_REQUEST, UserId: userId, StartTimeTicks: startPositionTicks };
    const { data } = await this.post<PlaybackInfoResponse>(`/Items/${item.id}/PlaybackInfo`, request, {
      params: {
        UserId: userId,
        StartTimeTicks: startPositionTicks,
        EnableDirectPlay: true,
        EnableDirectStream: false,
        EnableTranscoding: false,
        AllowVideoStreamCopy: false,
        AllowAudioStreamCopy: false,
        AutoOpenLiveStream: false,
      },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    if (!data.PlaySessionId) throw new Error("Jellyfin did not provide a play-session ID.");
    const source = selectDirectFileSource(data.MediaSources);
    const mediaSourceId = source.Id!;
    return {
      itemId: item.id,
      title: item.seriesName ? `${item.seriesName} — ${item.name}` : item.name,
      mediaSourceId,
      playSessionId: data.PlaySessionId,
      startPositionTicks,
      streamUrl: buildStaticStreamUrl(this.serverUrl, item.id, mediaSourceId, data.PlaySessionId, accessToken),
      tracks: (source.MediaStreams ?? []).flatMap((track) => {
        if (track.Index == null || !["Audio", "Subtitle", "Video"].includes(track.Type ?? "")) return [];
        return [{
          index: track.Index,
          type: track.Type as "Audio" | "Subtitle" | "Video",
          displayTitle: track.DisplayTitle ?? `${track.Type} ${track.Index}`,
          language: track.Language,
          external: Boolean(track.IsExternal),
          deliveryUrl: buildAuthenticatedResourceUrl(this.serverUrl, track.DeliveryUrl, accessToken),
        }];
      }),
    };
  }

  reportStart(plan: PlaybackPlan, snapshot: PlaybackSnapshot, signal?: AbortSignal): Promise<void> {
    return this.report("/Sessions/Playing", plan, snapshot, signal);
  }

  reportProgress(plan: PlaybackPlan, snapshot: PlaybackSnapshot, signal?: AbortSignal): Promise<void> {
    return this.report("/Sessions/Playing/Progress", plan, snapshot, signal);
  }

  reportStopped(plan: PlaybackPlan, snapshot: PlaybackSnapshot, signal?: AbortSignal, failed = false): Promise<void> {
    return this.report("/Sessions/Playing/Stopped", plan, snapshot, signal, { Failed: failed });
  }

  private async report(path: string, plan: PlaybackPlan, snapshot: PlaybackSnapshot, signal?: AbortSignal, extra?: { Failed: boolean }): Promise<void> {
    this.requireSession();
    await this.post(path, {
      ...extra,
      ItemId: plan.itemId,
      MediaSourceId: plan.mediaSourceId,
      PlaySessionId: plan.playSessionId,
      PositionTicks: secondsToTicks(snapshot.positionSeconds),
      IsPaused: snapshot.paused,
      IsMuted: snapshot.muted,
      VolumeLevel: Math.round(snapshot.volume),
      AudioStreamIndex: snapshot.audioTrack,
      SubtitleStreamIndex: snapshot.subtitleTrack,
      CanSeek: true,
      PlayMethod: "DirectPlay",
    }, {
      signal,
      timeout: REPORT_REQUEST_TIMEOUT_MS,
    });
  }

  private async get<T>(url: string, config?: HttpRequestConfig): Promise<{ data: T }> {
    try {
      return await this.transport.get<T>(url, config);
    } catch (error) {
      throw redactError(error);
    }
  }

  private async post<T>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<{ data: T }> {
    try {
      return await this.transport.post<T>(url, data, config);
    } catch (error) {
      throw redactError(error);
    }
  }

  private requireSession(): { accessToken: string; userId: string } {
    if (!this.accessToken || !this.userId) throw new Error("Sign in before using the library.");
    return { accessToken: this.accessToken, userId: this.userId };
  }
}
