import { Jellyfin, type Api } from "@jellyfin/sdk";
import axios from "axios";
import type { BrowseCard, BrowsePage, BrowseQuery, CardImageType, EpisodeCard, ItemDetail, LibraryItem, LibraryView, MediaCard, NextEpisode, SearchHint, SearchPage, SearchQuery, Season } from "../../domain/catalog";
import { ItemNotFoundError } from "../../domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot } from "../../domain/playback";
import { PlaybackRefusedError, secondsToTicks } from "../../domain/playback";
import { classifyHost, type HostClass } from "../../domain/host-class";
import type { ServerConnection } from "../../domain/server-connection";
import { isSupportedServerVersion, parseServerVersion } from "../../domain/server-version";
import type { MediaSegment } from "../../domain/media-segments";
import { MemoryLanHttpConfirmations, type LanHttpConfirmationStore } from "../lan-http-confirmations";
import { redactError, redactText } from "../redact";
import { toBrowseCards, toEpisodeCards, toNextEpisode, toHomeLibraries, toMediaCards, toSearchCards, toSearchHints, toSeasons } from "./cards";
import { deriveDeviceId } from "./device-id";
import { FLUSTER_PROFILE, MAX_BITRATE } from "./device-profile";
import { toItemDetail } from "./item-detail";
import { toMediaSegments, type MediaSegmentsResponse } from "./media-segments";
import { selectSource } from "./source-acceptance";
import type {
  AuthenticationResult,
  BaseItemDto,
  HttpRequestConfig,
  HttpResponse,
  HttpTransport,
  ItemsResult,
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
  // No request follows a redirect (docs/decisions/0001, edge case 8): a
  // server or anyone on the path must not be able to move the token, or the
  // probe, to another origin. The fetch adapter maps maxRedirects 0 to
  // `redirect: "manual"`; the XHR adapter cannot stop a redirect.
  const axiosInstance = axios.create({
    baseURL: serverUrl,
    timeout: CONTROL_REQUEST_TIMEOUT_MS,
    adapter: "fetch",
    maxRedirects: 0,
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

export const PUBLIC_HTTP_REFUSED_MESSAGE =
  "This address uses plain HTTP on the internet, so Fluster will not connect. Use HTTPS, or HTTP only for this device or a private home-network address such as 192.168.x.x, a name.local name, or a name.home.arpa name.";
export const REDIRECT_REFUSED_MESSAGE =
  "The server answered with a redirect, which Fluster does not follow. Enter the server's final address instead.";
export const UNENCRYPTED_NOT_CONFIRMED_MESSAGE =
  "Confirm the unencrypted connection to this server before signing in.";

function normalizeServerUrl(input: string): URL {
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
  if (url.protocol === "http:" && classifyHost(url) === "public") {
    throw new Error(PUBLIC_HTTP_REFUSED_MESSAGE);
  }
  url.hash = "";
  url.search = "";
  return url;
}

// A redirect arrives as a 3xx status (Node fetch rejects it through
// validateStatus) or, in a WebView, as an opaque redirect with status 0.
// Axios resolves status 0 (core/settle.js treats a falsy status as success),
// so every response must be checked as well as every error.
function isRedirectStatus(status: unknown): boolean {
  return typeof status === "number" && (status === 0 || (status >= 300 && status < 400));
}

function isRedirectError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return isRedirectStatus((error as { response?: { status?: unknown } }).response?.status);
}

// Fake transports may omit `status`; Axios always sets it.
function refuseRedirect<T>(response: HttpResponse<T>): HttpResponse<T> {
  if (isRedirectStatus(response.status)) throw new Error(REDIRECT_REFUSED_MESSAGE);
  return response;
}

export function buildStaticStreamUrl(
  serverUrl: string,
  itemId: string,
  mediaSourceId: string,
  playSessionId: string,
): string {
  const url = new URL(`${serverUrl}/Videos/${encodeURIComponent(itemId)}/stream`);
  url.searchParams.set("Static", "true");
  url.searchParams.set("MediaSourceId", mediaSourceId);
  url.searchParams.set("PlaySessionId", playSessionId);
  return url.toString();
}

// Query names Jellyfin accepts as a token, compared in lower case.
const CREDENTIAL_QUERY_NAMES = new Set(["apikey", "api_key", "access_token", "token", "x-emby-token"]);

// Jellyfin puts the session token into subtitle DeliveryUrl values as ApiKey.
// Drop every credential parameter: media requests authenticate with the
// Authorization header that Rust hands to libmpv (invariant I4).
function stripCredentialQuery(url: URL): void {
  const names = [...new Set(url.searchParams.keys())];
  for (const name of names) {
    if (CREDENTIAL_QUERY_NAMES.has(name.toLowerCase())) url.searchParams.delete(name);
  }
}

function buildSubtitleUrl(serverUrl: string, path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  let url: URL;
  try {
    url = new URL(path, `${serverUrl}/`);
  } catch {
    throw new Error("Jellyfin returned an invalid external subtitle URL.");
  }
  stripCredentialQuery(url);
  const serverOrigin = new URL(serverUrl).origin;
  const safeProtocol = url.protocol === "http:" || url.protocol === "https:";
  const hasCredentials = Boolean(url.username || url.password);
  if (!safeProtocol || url.origin !== serverOrigin || hasCredentials) {
    throw new Error("Jellyfin returned an unsafe external subtitle URL. Subtitle URLs must use the same server origin and must not contain credentials.");
  }
  url.hash = "";
  return url.toString();
}

export class JellyfinGateway {
  readonly serverUrl: string;
  readonly origin: string;
  readonly hostClass: HostClass;
  private readonly plainHttp: boolean;
  private transport: HttpTransport;
  private api?: Api;
  private accessToken?: string;
  private userId?: string;
  private serverId?: string;
  private deviceId?: string;

  constructor(
    serverUrl: string,
    transport?: HttpTransport,
    private readonly installId: string = crypto.randomUUID(),
    private readonly confirmations: LanHttpConfirmationStore = new MemoryLanHttpConfirmations(),
  ) {
    const url = normalizeServerUrl(serverUrl);
    this.serverUrl = url.toString().replace(/\/$/, "");
    this.origin = url.origin;
    this.hostClass = classifyHost(url);
    this.plainHttp = url.protocol === "http:";
    // Before login there is no user, so the unauthenticated API uses a
    // throwaway device id that is never sent with credentials.
    this.api = transport ? undefined : createSdkApi(this.serverUrl, "fluster-unauthenticated");
    this.transport = transport ?? (this.api!.axiosInstance as HttpTransport);
  }

  // The unauthenticated probe. For a private-LAN HTTP server it also reports
  // whether the user still has to confirm the unencrypted connection.
  async connect(signal?: AbortSignal): Promise<ServerConnection> {
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
    if (this.needsConsentForPlainHttp() && !data.Id) {
      throw new Error("The server did not report its Id, so Fluster cannot remember an unencrypted connection to it.");
    }
    this.serverId = data.Id;
    return {
      name: data.ServerName ?? "Jellyfin",
      version,
      hostClass: this.hostClass,
      needsUnencryptedConfirmation: this.needsConsentForPlainHttp() && !this.hasUnencryptedConsent(),
    };
  }

  // Records the user's choice to send the password and token without
  // encryption to this server Id at this origin. Call only after the user
  // confirmed the warning.
  confirmUnencryptedConnection(): void {
    if (!this.needsConsentForPlainHttp()) return;
    if (!this.serverId) throw new Error("Connect to the server before confirming an unencrypted connection.");
    this.confirmations.remember({ serverId: this.serverId, origin: this.origin });
  }

  private needsConsentForPlainHttp(): boolean {
    return this.plainHttp && this.hostClass === "private-lan";
  }

  private hasUnencryptedConsent(): boolean {
    if (!this.serverId) return false;
    return this.confirmations.has({ serverId: this.serverId, origin: this.origin });
  }

  // Runs before every sign-in request, so no password, Quick Connect secret,
  // or token reaches a private-LAN HTTP server the user has not confirmed.
  private requireTransportConsent(): void {
    if (this.needsConsentForPlainHttp() && !this.hasUnencryptedConsent()) {
      throw new Error(UNENCRYPTED_NOT_CONFIRMED_MESSAGE);
    }
  }

  async login(username: string, password: string, signal?: AbortSignal): Promise<{ userId: string; username: string }> {
    this.requireTransportConsent();
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
    this.requireTransportConsent();
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
    this.requireTransportConsent();
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
    this.requireTransportConsent();
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

  // The signed-in Authorization header, handed only to Rust: the server socket
  // (realtime_connect) and the playback plan's media requests. Never log it.
  authorizationHeader(): string {
    const { accessToken } = this.requireSession();
    if (!this.deviceId) throw new Error("Sign in before using the library.");
    return buildAuthorizationHeader(this.serverUrl, this.deviceId, accessToken);
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
      refuseRedirect(await transport.post("/Sessions/Logout", undefined, {
        headers: { Authorization: buildAuthorizationHeader(this.serverUrl, deviceId, accessToken) },
        timeout: REPORT_REQUEST_TIMEOUT_MS,
      }));
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
        // ItemSortBy has no relevance option; a fixed order keeps limit+1 paging stable.
        sortBy: "SortName",
        sortOrder: "Ascending",
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

  // GET /Shows/{seriesId}/Episodes?adjacentTo={id} (@jellyfin/sdk 1.0.2
  // show-api getEpisodes: "Return items that are siblings of a supplied item").
  // The server keeps the previous, the current, and the next episode in series
  // order (UserViewBuilder.FilterForAdjacency), so the next one is the entry
  // after the current one. It does not depend on played state, unlike NextUp.
  async nextEpisode(seriesId: string, episodeId: string, signal?: AbortSignal): Promise<NextEpisode | undefined> {
    const { userId } = this.requireSession();
    const { data } = await this.get<ItemsResult>(`/Shows/${encodeURIComponent(seriesId)}/Episodes`, {
      params: { userId, adjacentTo: episodeId, isMissing: false },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    // isMissing=false asks the server to leave out placeholders; this guards a server that does not.
    const items = (data.Items ?? []).filter((item) => item.LocationType !== "Virtual");
    const current = items.findIndex((item) => item.Id === episodeId);
    return current === -1 ? undefined : toNextEpisode(items[current + 1]);
  }

  // GET /Items/{id} takes only a user id in @jellyfin/sdk 1.0.2 (library-api
  // getItem), so there is no fields parameter. The server returns media
  // sources, streams, genres, people, and user data in the full item.
  async itemDetail(itemId: string, signal?: AbortSignal): Promise<ItemDetail> {
    const { userId } = this.requireSession();
    let data: BaseItemDto;
    try {
      ({ data } = await this.get<BaseItemDto>(`/Items/${encodeURIComponent(itemId)}`, {
        params: { userId },
        signal,
        timeout: CONTROL_REQUEST_TIMEOUT_MS,
      }));
    } catch (error) {
      if ((error as { response?: { status?: unknown } } | null)?.response?.status === 404) throw new ItemNotFoundError();
      throw error;
    }
    const detail = toItemDetail(data);
    if (!detail) throw new Error("Jellyfin returned an item without an ID or name.");
    return detail;
  }

  // GET /Videos/{itemId}/Trickplay/{width}/{index}.jpg needs the Authorization
  // header (trick-play-api.js getTrickplayTileImage, and [Authorize] on
  // TrickplayController), which an <img> cannot send. Fetch the bytes here so
  // no token is ever put in a URL.
  async trickplayTile(
    itemId: string,
    mediaSourceId: string,
    width: number,
    index: number,
    signal?: AbortSignal,
  ): Promise<Blob> {
    this.requireSession();
    const { data } = await this.get<Blob>(
      `/Videos/${encodeURIComponent(itemId)}/Trickplay/${width}/${index}.jpg`,
      { params: { mediaSourceId }, responseType: "blob", signal, timeout: CONTROL_REQUEST_TIMEOUT_MS },
    );
    return data;
  }

  // POST marks the item played and DELETE marks it unplayed (user-data-api
  // markPlayedItem and markUnplayedItem, /UserPlayedItems/{itemId}).
  async setPlayed(itemId: string, played: boolean, signal?: AbortSignal): Promise<void> {
    await this.setUserFlag("UserPlayedItems", itemId, played, signal);
  }

  // /UserFavoriteItems/{itemId}: POST marks a favorite, DELETE removes it.
  async setFavorite(itemId: string, favorite: boolean, signal?: AbortSignal): Promise<void> {
    await this.setUserFlag("UserFavoriteItems", itemId, favorite, signal);
  }

  private async setUserFlag(collection: string, itemId: string, on: boolean, signal?: AbortSignal): Promise<void> {
    const { userId } = this.requireSession();
    const url = `/${collection}/${encodeURIComponent(itemId)}`;
    const config = { params: { userId }, signal, timeout: CONTROL_REQUEST_TIMEOUT_MS };
    if (on) await this.post(url, undefined, config);
    else await this.delete(url, config);
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

  // GET /MediaSegments/{itemId} (media-segment-api getItemSegments; 10.10+,
  // authenticated by header like every other call). The type filter is a
  // repeated query parameter, which Axios params would encode as `[]`, so it
  // is written into the URL. Callers check HasSegments first.
  async mediaSegments(itemId: string, signal?: AbortSignal): Promise<MediaSegment[]> {
    const { data } = await this.get<MediaSegmentsResponse>(
      `/MediaSegments/${encodeURIComponent(itemId)}?includeSegmentTypes=Intro&includeSegmentTypes=Outro`,
      { signal, timeout: CONTROL_REQUEST_TIMEOUT_MS },
    );
    return toMediaSegments(data);
  }

  async createPlaybackPlan(
    item: LibraryItem,
    startPositionTicks = 0,
    signal?: AbortSignal,
    mediaSourceId?: string,
  ): Promise<PlaybackPlan> {
    const { userId } = this.requireSession();
    const request = {
      ...DIRECT_PLAY_REQUEST,
      UserId: userId,
      StartTimeTicks: startPositionTicks,
      MaxStreamingBitrate: MAX_BITRATE,
      ...(mediaSourceId ? { MediaSourceId: mediaSourceId } : {}),
      DeviceProfile: FLUSTER_PROFILE,
    };
    const { data } = await this.post<PlaybackInfoResponse>(`/Items/${item.id}/PlaybackInfo`, request, {
      params: { ...DIRECT_PLAY_REQUEST, UserId: userId, StartTimeTicks: startPositionTicks },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    const decision = selectSource(data.MediaSources, mediaSourceId);
    if (decision.kind === "refused") {
      throw new PlaybackRefusedError({ reason: decision.reason, detail: decision.detail });
    }
    if (!data.PlaySessionId) throw new Error("Jellyfin did not provide a play-session ID.");
    const source = decision.source;
    return {
      itemId: item.id,
      title: item.seriesName ? `${item.seriesName} — ${item.name}` : item.name,
      mediaSourceId: source.Id,
      playSessionId: data.PlaySessionId,
      startPositionTicks,
      streamUrl: buildStaticStreamUrl(this.serverUrl, item.id, source.Id, data.PlaySessionId),
      authorization: this.authorizationHeader(),
      hasSegments: source.HasSegments === true,
      tracks: (source.MediaStreams ?? []).flatMap((track) => {
        if (track.Index == null || !["Audio", "Subtitle", "Video"].includes(track.Type ?? "")) return [];
        return [{
          index: track.Index,
          type: track.Type as "Audio" | "Subtitle" | "Video",
          displayTitle: track.DisplayTitle ?? `${track.Type} ${track.Index}`,
          codec: track.Codec,
          language: track.Language,
          external: Boolean(track.IsExternal),
          deliveryUrl: buildSubtitleUrl(this.serverUrl, track.DeliveryUrl),
        }];
      }),
      defaultAudioStreamIndex: source.DefaultAudioStreamIndex ?? undefined,
      defaultSubtitleStreamIndex: source.DefaultSubtitleStreamIndex ?? undefined,
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

  private async get<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    let response: HttpResponse<T>;
    try {
      response = await this.transport.get<T>(url, config);
    } catch (error) {
      if (isRedirectError(error)) throw new Error(REDIRECT_REFUSED_MESSAGE);
      throw redactError(error);
    }
    return refuseRedirect(response);
  }

  private async post<T>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    let response: HttpResponse<T>;
    try {
      response = await this.transport.post<T>(url, data, config);
    } catch (error) {
      if (isRedirectError(error)) throw new Error(REDIRECT_REFUSED_MESSAGE);
      throw redactError(error);
    }
    return refuseRedirect(response);
  }

  private async delete<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    let response: HttpResponse<T>;
    try {
      response = await this.transport.delete<T>(url, config);
    } catch (error) {
      if (isRedirectError(error)) throw new Error(REDIRECT_REFUSED_MESSAGE);
      throw redactError(error);
    }
    return refuseRedirect(response);
  }

  private requireSession(): { accessToken: string; userId: string } {
    if (!this.accessToken || !this.userId) throw new Error("Sign in before using the library.");
    return { accessToken: this.accessToken, userId: this.userId };
  }
}
