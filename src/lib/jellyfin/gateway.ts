import { Jellyfin, type Api } from "@jellyfin/sdk";
import axios from "axios";
import type { BrowseCard, BrowsePage, BrowseQuery, CardImageType, EpisodeCard, ItemDetail, LibraryItem, LibraryView, MediaCard, NextEpisode, SearchHint, SearchPage, SearchQuery, Season, SeriesNextUp } from "../../domain/catalog";
import { ItemNotFoundError } from "../../domain/catalog";
import type { RecentPlays } from "../../domain/up-next";
import type { PlaybackDelivery, PlaybackPlan, PlaybackPlanOptions, PlaybackSnapshot, ServerPlayMethod } from "../../domain/playback";
import { PlaybackRefusedError, secondsToTicks } from "../../domain/playback";
import type { AccountLanguageChange, AccountLanguageSettings } from "../../domain/account-language-choices";
import type { AccountLanguages, LanguageCulture } from "../../domain/languages";
import { classifyHost, type HostClass } from "../../domain/host-class";
import type { ServerConnection } from "../../domain/server-connection";
import { SignInFailure } from "../../domain/sign-in-failure";
import { isSupportedServerVersion, parseServerVersion } from "../../domain/server-version";
import type { MediaSegment } from "../../domain/media-segments";
import { MemoryLanHttpConfirmations, type LanHttpConfirmationStore } from "../lan-http-confirmations";
import { limitMbpsFor, mbpsToBitsPerSecond, MemoryStreamingLimits, type StreamingLimitStore } from "../streaming-limits";
import { redactText } from "../redact";
import { redactTransportError } from "../transport-error";
import { toBrowseCards, toEpisodeCards, toNextEpisode, toHomeLibraries, toMediaCards, toRecentPlays, toSearchCards, toSearchHints, toSeasons, toSeriesNextUp } from "./cards";
import { stripCredentialQuery } from "./credential-query";
import { deriveDeviceId } from "./device-id";
import { limitIsOnlyReason } from "./client-limit";
import { FLUSTER_PROFILE, MAX_BITRATE } from "./device-profile";
import { AccountConfigurationUnreadable, isPlainRecord, toAccountLanguages, toAccountLanguageSettings, toLanguageCultures, withLanguageChange } from "./account-languages";
import { toItemDetail } from "./item-detail";
import { toMediaSegments, type MediaSegmentsResponse } from "./media-segments";
import { findSessionPlayMethod, type SessionDto } from "./session-play-method";
import { selectSource } from "./source-acceptance";
import type {
  AuthenticationResult,
  BaseItemDto,
  HttpRequestConfig,
  HttpResponse,
  HttpTransport,
  ItemsResult,
  MediaSourceDto,
  PlaybackInfoResponse,
  QuickConnectResult,
  SearchHintResult,
  CultureDto,
  ServerInfo,
  UserDto,
} from "./types";

export const CONTROL_REQUEST_TIMEOUT_MS = 15_000;
export const REPORT_REQUEST_TIMEOUT_MS = 3_000;

export const HOME_ROW_LIMIT = 16;
// The only ItemFields a card needs. ProductionYear and RunTimeTicks are
// always returned and are not valid values here.
const CARD_FIELDS = "PrimaryImageAspectRatio";
const NEXT_UP_FIELDS = "PrimaryImageAspectRatio,DateCreated";
const RECENTLY_PLAYED_LIMIT = 100;
const SIMILAR_LIMIT = 12;
const CARD_IMAGE_PARAMS = {
  fields: CARD_FIELDS,
  imageTypeLimit: 1,
  enableImageTypes: "Primary,Backdrop,Thumb,Logo",
};

const SEARCH_HINT_LIMIT = 8;
const SEARCH_TYPES = "Movie,Series,Episode";

// What the server shows for this client in its device list. The composition
// root supplies both; the core reads no build or platform globals.
export interface ClientIdentity {
  version: string;
  deviceName: string;
}

// Deliberately not a real version, so a path that forgets the identity is
// visible on the server.
const UNIDENTIFIED_CLIENT: ClientIdentity = { version: "0.0.0", deviceName: "Fluster" };

// Jellyfin binds the Quick Connect token to the DeviceId sent with Initiate
// (QuickConnectManager.cs:72-93, 154-163), before any user is known, so a
// per-user id is impossible. The placeholder contains "#", which Jellyfin
// rejects in usernames (UserManager.cs:119), so no real user can collide.
const QUICK_CONNECT_DEVICE_USER = "#quick-connect";

function createClient(client: ClientIdentity, deviceId: string): Jellyfin {
  return new Jellyfin({
    clientInfo: { name: "Fluster", version: client.version },
    deviceInfo: { name: client.deviceName, id: deviceId },
  });
}

function buildAuthorizationHeader(client: ClientIdentity, serverUrl: string, deviceId: string, accessToken?: string): string {
  return createClient(client, deviceId).createApi(serverUrl, accessToken).authorizationHeader;
}

function createSdkApi(client: ClientIdentity, serverUrl: string, deviceId: string, accessToken?: string): Api {
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
  const api = createClient(client, deviceId).createApi(serverUrl, accessToken, axiosInstance);
  axiosInstance.defaults.headers.common.Authorization = api.authorizationHeader;
  return api;
}

// The decision 0002 "Negotiation" flags. They go in the body and the query
// string, so a body-binding change on the server cannot flip them.
// EnableDirectPlay is false only on the forced-fallback request.
export const PLAYBACK_INFO_FLAGS = Object.freeze({
  EnableDirectPlay: true,
  EnableDirectStream: true,
  EnableTranscoding: true,
  AllowVideoStreamCopy: true,
  AllowAudioStreamCopy: true,
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
    throw new SignInFailure("invalid-address", "Enter a valid Jellyfin server URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SignInFailure("invalid-address", "The server URL must use http:// or https://.");
  }
  if (url.username || url.password) {
    throw new SignInFailure("invalid-address", "The server URL must not include a username or password.");
  }
  if (url.protocol === "http:" && classifyHost(url) === "public") {
    throw new SignInFailure("public-http", PUBLIC_HTTP_REFUSED_MESSAGE);
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
  if (isRedirectStatus(response.status)) throw new SignInFailure("redirect", REDIRECT_REFUSED_MESSAGE);
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
  private accountWrite: Promise<unknown> = Promise.resolve();
  private transport: HttpTransport;
  private api?: Api;
  private accessToken?: string;
  private userId?: string;
  private userName?: string;
  private serverId?: string;
  private deviceId?: string;

  constructor(
    serverUrl: string,
    transport?: HttpTransport,
    private readonly installId: string = crypto.randomUUID(),
    private readonly confirmations: LanHttpConfirmationStore = new MemoryLanHttpConfirmations(),
    private readonly streamingLimits: StreamingLimitStore = new MemoryStreamingLimits(),
    private readonly client: ClientIdentity = UNIDENTIFIED_CLIENT,
  ) {
    const url = normalizeServerUrl(serverUrl);
    this.serverUrl = url.toString().replace(/\/$/, "");
    this.origin = url.origin;
    this.hostClass = classifyHost(url);
    this.plainHttp = url.protocol === "http:";
    // Before login there is no user, so the unauthenticated API uses a
    // throwaway device id that is never sent with credentials.
    this.api = transport ? undefined : createSdkApi(this.client, this.serverUrl, "fluster-unauthenticated");
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
      throw new SignInFailure("unexpected-response", "The server returned an unexpected public-info response. Check the URL and reverse-proxy routing.");
    }
    const version = data.Version;
    const parsed = parseServerVersion(version);
    if (!parsed || !isSupportedServerVersion(parsed)) {
      throw new SignInFailure("unsupported-version", `Fluster needs Jellyfin 10.11 or newer; this server reports ${version}.`);
    }
    if (this.needsConsentForPlainHttp() && !data.Id) {
      throw new SignInFailure("unexpected-response", "The server did not report its Id, so Fluster cannot remember an unencrypted connection to it.");
    }
    this.serverId = data.Id;
    return {
      name: data.ServerName ?? "Jellyfin",
      id: typeof data.Id === "string" ? data.Id : undefined,
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

  // Withdraws a choice recorded by confirmUnencryptedConnection, for a user
  // who cancels before the connection proceeds.
  forgetUnencryptedConnection(): void {
    if (!this.serverId) return;
    this.confirmations.forget({ serverId: this.serverId, origin: this.origin });
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
      throw new SignInFailure("not-confirmed", UNENCRYPTED_NOT_CONFIRMED_MESSAGE);
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
      headers: { Authorization: buildAuthorizationHeader(this.client, this.serverUrl, deviceId) },
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
      headers: { Authorization: buildAuthorizationHeader(this.client, this.serverUrl, deviceId) },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    if (!data?.Secret || !data.Code) throw new SignInFailure("unexpected-response", "Jellyfin did not return a Quick Connect code.");
    return { secret: data.Secret, code: data.Code };
  }

  // The API requires the secret in the query string. It is not the access
  // token, but errors still go through redaction, which covers `secret`.
  async pollQuickConnect(secret: string, signal?: AbortSignal): Promise<{ authenticated: boolean }> {
    this.requireTransportConsent();
    const deviceId = await this.quickConnectDeviceId();
    const { data } = await this.get<QuickConnectResult>("/QuickConnect/Connect", {
      params: { secret },
      headers: { Authorization: buildAuthorizationHeader(this.client, this.serverUrl, deviceId) },
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
      headers: { Authorization: buildAuthorizationHeader(this.client, this.serverUrl, deviceId) },
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
    if (!data.AccessToken || !data.User?.Id) throw new SignInFailure("unexpected-response", "Jellyfin did not return a valid user session.");
    this.accessToken = data.AccessToken;
    this.userId = data.User.Id;
    this.userName = data.User.Name ?? fallbackName;
    this.deviceId = deviceId;
    if (this.api) {
      this.api = createSdkApi(this.client, this.serverUrl, deviceId, data.AccessToken);
      this.transport = this.api.axiosInstance as HttpTransport;
    }
    return { userId: data.User.Id, username: this.userName };
  }

  // The signed-in user's display name, or undefined when signed out. Display only.
  currentUserName(): string | undefined {
    return this.accessToken ? this.userName : undefined;
  }

  // The signed-in Authorization header, handed only to Rust: the server socket
  // (realtime_connect) and the native engine's launch request, read through the
  // coordinator at launch. Plans never carry it. Never log it.
  authorizationHeader(): string {
    const { accessToken } = this.requireSession();
    if (!this.deviceId) throw new Error("Sign in before using the library.");
    return buildAuthorizationHeader(this.client, this.serverUrl, this.deviceId, accessToken);
  }

  async logout(): Promise<void> {
    const { accessToken, deviceId } = this;
    // Clear local state first so the UI can never keep a revoked token.
    this.accessToken = undefined;
    this.userId = undefined;
    this.userName = undefined;
    this.deviceId = undefined;
    const transport = this.transport;
    if (this.api) {
      this.api = createSdkApi(this.client, this.serverUrl, "fluster-unauthenticated");
      this.transport = this.api.axiosInstance as HttpTransport;
    }
    if (!accessToken || !deviceId) return;
    try {
      refuseRedirect(await transport.post("/Sessions/Logout", undefined, {
        headers: { Authorization: buildAuthorizationHeader(this.client, this.serverUrl, deviceId, accessToken) },
        timeout: REPORT_REQUEST_TIMEOUT_MS,
      }));
    } catch (error) {
      console.warn("Server logout failed; the local session was cleared.", error instanceof Error ? redactText(error.message) : "unknown error");
    }
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
        // A series whose next episode is in progress is in Resume, so it is not listed twice.
        enableResumable: false,
        enableTotalRecordCount: false,
        ...CARD_IMAGE_PARAMS,
        // DateCreated dates a new episode. No nextUpDateCutoff: it would hide a caught-up series
        // whose new episode arrived after the cutoff (docs/research/discovery-api.md section 3).
        fields: NEXT_UP_FIELDS,
      },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    return toMediaCards(data.Items);
  }

  // Finished films and episodes, newest first, with no images. It dates a next episode by its series'
  // last play, and gives the "last thing finished" the hero's sequel and similar rules start from.
  async recentlyPlayed(signal?: AbortSignal): Promise<RecentPlays> {
    const { userId } = this.requireSession();
    const { data } = await this.get<ItemsResult>("/Items", {
      params: {
        userId,
        recursive: true,
        includeItemTypes: "Movie,Episode",
        filters: "IsPlayed",
        sortBy: "DatePlayed",
        sortOrder: "Descending",
        limit: RECENTLY_PLAYED_LIMIT,
        enableUserData: true,
        enableImages: false,
        enableTotalRecordCount: false,
      },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    return toRecentPlays(data.Items, RECENTLY_PLAYED_LIMIT);
  }

  // Titles like this one, watched ones included: the caller drops them.
  async similarItems(itemId: string, signal?: AbortSignal): Promise<MediaCard[]> {
    const { userId } = this.requireSession();
    const { data } = await this.get<ItemsResult>(`/Items/${encodeURIComponent(itemId)}/Similar`, {
      params: {
        userId,
        limit: SIMILAR_LIMIT,
        enableUserData: true,
        enableTotalRecordCount: false,
        ...CARD_IMAGE_PARAMS,
      },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    return toMediaCards(data.Items);
  }

  // The collections an item belongs to, or undefined when the server has no such route (Jellyfin 10.11 answers 404).
  async itemCollections(itemId: string, signal?: AbortSignal): Promise<MediaCard[] | undefined> {
    const { userId } = this.requireSession();
    try {
      const { data } = await this.get<ItemsResult>(`/Items/${encodeURIComponent(itemId)}/Collections`, {
        params: { userId, ...CARD_IMAGE_PARAMS },
        signal,
        timeout: CONTROL_REQUEST_TIMEOUT_MS,
      });
      return toMediaCards(data.Items);
    } catch (error) {
      if ((error as { response?: { status?: unknown } } | null)?.response?.status === 404) return undefined;
      throw error;
    }
  }

  // A collection's films in release order.
  async collectionItems(collectionId: string, signal?: AbortSignal): Promise<MediaCard[]> {
    const { userId } = this.requireSession();
    const { data } = await this.get<ItemsResult>("/Items", {
      params: {
        userId,
        parentId: collectionId,
        sortBy: "PremiereDate,ProductionYear,SortName",
        sortOrder: "Ascending",
        enableUserData: true,
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

  // Lists a library or collection page. It fetches one extra item to learn whether more pages
  // exist. Only the first page asks for the total count, which the toolbar shows.
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
      enableTotalRecordCount: query.startIndex === 0,
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
    const page: BrowsePage = { cards, hasMore: rawItems.length > query.limit };
    const total = data.TotalRecordCount;
    if (query.startIndex === 0 && typeof total === "number" && Number.isFinite(total) && total >= 0) page.totalCount = total;
    return page;
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

  async seriesNextUp(seriesId: string, signal?: AbortSignal): Promise<SeriesNextUp | undefined> {
    const { userId } = this.requireSession();
    const { data } = await this.get<ItemsResult>("/Shows/NextUp", {
      params: {
        userId,
        seriesId,
        limit: 1,
        enableUserData: true,
        enableResumable: true,
        enableRewatching: false,
        enableImages: false,
        enableTotalRecordCount: false,
      },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    return toSeriesNextUp(data.Items?.[0]);
  }

  async episodes(seriesId: string, seasonId: string, signal?: AbortSignal): Promise<EpisodeCard[]> {
    const { userId } = this.requireSession();
    const { data } = await this.get<ItemsResult>(`/Shows/${encodeURIComponent(seriesId)}/Episodes`, {
      params: {
        userId,
        seasonId,
        fields: "Overview,PrimaryImageAspectRatio",
        enableUserData: true,
        imageTypeLimit: CARD_IMAGE_PARAMS.imageTypeLimit,
        enableImageTypes: CARD_IMAGE_PARAMS.enableImageTypes,
      },
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
      params: {
        userId,
        adjacentTo: episodeId,
        isMissing: false,
        imageTypeLimit: CARD_IMAGE_PARAMS.imageTypeLimit,
        enableImageTypes: CARD_IMAGE_PARAMS.enableImageTypes,
      },
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

  // The account's language settings from GET /Users/Me. The subtitle language is display only; the audio
  // language orders the title page's audio Picker. The server still picks the track a play with no pick starts.
  async accountLanguages(signal?: AbortSignal): Promise<AccountLanguages> {
    this.requireSession();
    const { data } = await this.get<UserDto>("/Users/Me", { signal, timeout: CONTROL_REQUEST_TIMEOUT_MS });
    return toAccountLanguages(data);
  }

  // The account's four language fields for Settings, from GET /Users/Me.
  async accountLanguageSettings(signal?: AbortSignal): Promise<AccountLanguageSettings> {
    this.requireSession();
    const { data } = await this.get<UserDto>("/Users/Me", { signal, timeout: CONTROL_REQUEST_TIMEOUT_MS });
    return toAccountLanguageSettings(isPlainRecord(data) ? data.Configuration : undefined);
  }

  // Jellyfin replaces the whole Configuration on save (P17-01), so read it fresh, change only the row's fields,
  // and post every other field back as read. Saves run one at a time. No signal: leaving Settings must not
  // abandon a write half-way. The raw body stays in this method; only the four mapped fields leave it.
  saveAccountLanguages(change: AccountLanguageChange): Promise<AccountLanguageSettings> {
    const run = this.accountWrite.then(async () => {
      this.requireSession();
      const { data } = await this.get<UserDto>("/Users/Me", { timeout: CONTROL_REQUEST_TIMEOUT_MS });
      const configuration = isPlainRecord(data) ? data.Configuration : undefined;
      if (!isPlainRecord(configuration)) throw new AccountConfigurationUnreadable("Jellyfin returned no account configuration.");
      const next = withLanguageChange(configuration, change);
      await this.post("/Users/Configuration", next, { timeout: CONTROL_REQUEST_TIMEOUT_MS });
      return toAccountLanguageSettings(next);
    });
    this.accountWrite = run.catch(() => undefined);
    return run;
  }

  // The server's language table (GET /Localization/Cultures): which codes name the same language.
  async languageCultures(signal?: AbortSignal): Promise<LanguageCulture[]> {
    this.requireSession();
    const { data } = await this.get<CultureDto[]>("/Localization/Cultures", { signal, timeout: CONTROL_REQUEST_TIMEOUT_MS });
    return toLanguageCultures(data);
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
    this.requireSession();
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
    options: PlaybackPlanOptions = {},
  ): Promise<PlaybackPlan> {
    const limit = this.clientLimitBitrate(options);
    const context = (answer: PlaybackInfoResponse) => ({
      serverUrl: this.serverUrl,
      itemId: item.id,
      playSessionId: answer.PlaySessionId,
    });
    const streams = streamIndices(options);
    // A viewer's audio pick (P17-08): the index, only when the session started from a pick and names its version.
    const picked = options.keepDirectPlay === true && mediaSourceId ? streams.AudioStreamIndex : undefined;
    let data = await this.playbackInfo(item.id, startPositionTicks, signal, mediaSourceId, true, limit, streams);
    let decision = selectSource(data.MediaSources, context(data), mediaSourceId);
    // Whether the answer in use was asked for with the pick.
    let carriesPick = streams.AudioStreamIndex !== undefined;
    if (picked !== undefined && decision.kind !== "force-fallback"
      && !(decision.kind === "direct-play" && hasEmbeddedAudio(decision.source, picked))) {
      // The same request without the index. A pick never costs a direct play (ARCHITECTURE.md §3, I1):
      // the index's answer is used for a conversion only when this one converts too.
      const { AudioStreamIndex: _dropped, ...plainStreams } = streams;
      const plain = await this.playbackInfo(item.id, startPositionTicks, signal, mediaSourceId, true, limit, plainStreams);
      const plainDecision = selectSource(plain.MediaSources, context(plain), mediaSourceId);
      if (plainDecision.kind === "direct-play") {
        data = plain;
        decision = plainDecision;
        carriesPick = false;
      } else if (decision.kind !== "convert") {
        data = plain;
        decision = plainDecision;
        carriesPick = false;
      }
    }
    if (decision.kind === "force-fallback") {
      // Rule 4: a disc folder or ISO the server offered for direct play. Ask
      // once more for that source without direct play, and never loop.
      const { reason, source } = decision;
      data = await this.playbackInfo(item.id, startPositionTicks, signal, source.Id, false, limit, streams);
      carriesPick = streams.AudioStreamIndex !== undefined;
      decision = selectSource(data.MediaSources, context(data), source.Id);
      if (decision.kind === "force-fallback") {
        decision = { kind: "refused", reason, detail: "direct play offered again" };
      }
    }
    if (decision.kind === "refused") {
      throw new PlaybackRefusedError({ reason: decision.reason, detail: decision.detail });
    }
    if (!data.PlaySessionId) throw new Error("Jellyfin did not provide a play-session ID.");
    const source = decision.source;
    const delivery: PlaybackDelivery = decision.kind === "direct-play"
      ? { delivery: "static", playMethod: "DirectPlay", conversionReasons: [] }
      : {
        delivery: "hls",
        playMethod: decision.playMethod,
        conversionReasons: decision.conversionReasons,
        serverUrl: this.serverUrl,
        mediaKind: decision.mediaKind,
      };
    return {
      itemId: item.id,
      title: item.seriesName ? `${item.seriesName} — ${item.name}` : item.name,
      mediaSourceId: source.Id,
      playSessionId: data.PlaySessionId,
      startPositionTicks,
      ...delivery,
      streamUrl: decision.kind === "direct-play"
        ? buildStaticStreamUrl(this.serverUrl, item.id, source.Id, data.PlaySessionId)
        : decision.masterUrl,
      hasSegments: source.HasSegments === true,
      ...(typeof source.Bitrate === "number" ? { sourceBitrate: source.Bitrate } : {}),
      subtitlesBurnedIn: decision.kind === "convert" && decision.subtitlesBurnedIn,
      playOriginalAvailable: decision.kind === "convert"
        && limitIsOnlyReason(source, decision.conversionReasons, limit),
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
          ...(track.Title ? { title: track.Title } : {}),
          ...(typeof track.Channels === "number" && track.Channels > 0 ? { channels: track.Channels } : {}),
          ...(track.IsDefault ? { isDefault: true } : {}),
          ...(track.IsForced ? { isForced: true } : {}),
          ...(track.IsHearingImpaired ? { isHearingImpaired: true } : {}),
        }];
      }),
      defaultAudioStreamIndex: picked !== undefined && (carriesPick || decision.kind === "direct-play") && hasEmbeddedAudio(source, picked)
        ? picked
        : source.DefaultAudioStreamIndex ?? undefined,
      defaultSubtitleStreamIndex: source.DefaultSubtitleStreamIndex ?? undefined,
    };
  }

  // The user's limit for this server's host class, as the bitrate to send.
  // "No limit" sends MAX_BITRATE, as before the setting existed. Play original
  // skips the user's limit for one negotiation and is never stored.
  private clientLimitBitrate(options: PlaybackPlanOptions): number {
    if (options.ignoreStreamingLimit) return MAX_BITRATE;
    const mbps = limitMbpsFor(this.hostClass, this.streamingLimits.get());
    return mbps === undefined ? MAX_BITRATE : mbpsToBitsPerSecond(mbps);
  }

  // POST /Items/{id}/PlaybackInfo with the Fluster DeviceProfile and the
  // decision 0002 flags in body and query. AlwaysBurnInSubtitleWhenTranscoding
  // is body-only: it is not a query parameter in the 10.11.7 or 12.4 OpenAPI.
  // AudioStreamIndex and SubtitleStreamIndex go in both too (PlaybackInfoDto
  // and getPostedPlaybackInfo in SDK 1.0.2; the query wins on the server,
  // MediaInfoController.cs v10.11.7 and v12.4 lines 155-156).
  private async playbackInfo(
    itemId: string,
    startPositionTicks: number,
    signal: AbortSignal | undefined,
    mediaSourceId: string | undefined,
    enableDirectPlay: boolean,
    maxStreamingBitrate: number,
    streams: StreamIndexParams,
  ): Promise<PlaybackInfoResponse> {
    const { userId } = this.requireSession();
    const flags = { ...PLAYBACK_INFO_FLAGS, EnableDirectPlay: enableDirectPlay };
    const request = {
      ...flags,
      AlwaysBurnInSubtitleWhenTranscoding: false,
      UserId: userId,
      StartTimeTicks: startPositionTicks,
      MaxStreamingBitrate: maxStreamingBitrate,
      ...streams,
      ...(mediaSourceId ? { MediaSourceId: mediaSourceId } : {}),
      DeviceProfile: { ...FLUSTER_PROFILE, MaxStreamingBitrate: maxStreamingBitrate },
    };
    const { data } = await this.post<PlaybackInfoResponse>(`/Items/${encodeURIComponent(itemId)}/PlaybackInfo`, request, {
      params: { ...flags, UserId: userId, StartTimeTicks: startPositionTicks, MaxStreamingBitrate: maxStreamingBitrate, ...streams },
      signal,
      timeout: CONTROL_REQUEST_TIMEOUT_MS,
    });
    return data;
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

  // DELETE /Videos/ActiveEncodings?deviceId=&playSessionId= kills the
  // server's conversion jobs for one play session ([Authorize], both
  // parameters required; HlsSegmentController.cs v10.11.7 lines 108-117,
  // v12.4 lines 103-112). Neither the 12.4 OpenAPI nor SDK 1.0.2 lists it, so
  // it uses the gateway's request path: header auth, no redirects, redacted
  // errors, and the report timeout.
  async stopActiveEncoding(playSessionId: string, signal?: AbortSignal): Promise<void> {
    this.requireSession();
    if (!this.deviceId) throw new Error("Sign in before using the library.");
    await this.delete("/Videos/ActiveEncodings", {
      params: { deviceId: this.deviceId, playSessionId },
      signal,
      timeout: REPORT_REQUEST_TIMEOUT_MS,
    });
  }

  // What the server's session says about a running conversion (decision
  // 0002 rule 5 as amended by the user, 2026-11-08: the plan's label is
  // provisional). GET /Sessions?deviceId= ([Authorize], deviceId filters by
  // device; a non-admin sees only their own sessions: SessionController.cs
  // GetSessions, SessionManager.GetSessions v10.11.7 lines 1939-2020, v12.4
  // lines 2081-2162; getSessions(controllableByUserId, deviceId,
  // activeWithinSeconds) in SDK 1.0.2). The play-session id is never sent.
  async sessionPlayMethod(plan: Pick<PlaybackPlan, "itemId" | "mediaSourceId">, signal?: AbortSignal): Promise<ServerPlayMethod | undefined> {
    this.requireSession();
    if (!this.deviceId) throw new Error("Sign in before using the library.");
    const { data } = await this.get<SessionDto[]>("/Sessions", {
      params: { deviceId: this.deviceId },
      signal,
      timeout: REPORT_REQUEST_TIMEOUT_MS,
    });
    return findSessionPlayMethod(Array.isArray(data) ? data : [], this.deviceId, plan);
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
      // Jellyfin's PlayMethod enum (SDK 1.0.2 play-method.d.ts): the plan's own.
      PlayMethod: plan.playMethod,
    }, {
      signal,
      timeout: REPORT_REQUEST_TIMEOUT_MS,
    });
  }

  private async send<T>(request: () => Promise<HttpResponse<T>>): Promise<HttpResponse<T>> {
    let response: HttpResponse<T>;
    try {
      response = await request();
    } catch (error) {
      if (isRedirectError(error)) throw new SignInFailure("redirect", REDIRECT_REFUSED_MESSAGE);
      throw redactTransportError(error);
    }
    return refuseRedirect(response);
  }

  private get<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    return this.send(() => this.transport.get<T>(url, config));
  }

  private post<T>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    return this.send(() => this.transport.post<T>(url, data, config));
  }

  private delete<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    return this.send(() => this.transport.delete<T>(url, config));
  }

  private requireSession(): { accessToken: string; userId: string } {
    if (!this.accessToken || !this.userId) throw new Error("Sign in before using the library.");
    return { accessToken: this.accessToken, userId: this.userId };
  }
}

// True when the source has an embedded audio stream at the index. An external audio file is never
// loaded by the player, so a pick of one cannot be applied.
function hasEmbeddedAudio(source: MediaSourceDto, index: number): boolean {
  return (source.MediaStreams ?? []).some((stream) => stream.Type === "Audio" && stream.Index === index && stream.IsExternal !== true);
}

interface StreamIndexParams {
  AudioStreamIndex?: number;
  SubtitleStreamIndex?: number;
}

// The track choice for a renegotiation. The server applies it only to the
// source named by MediaSourceId (MediaInfoHelper.cs v10.11.7 lines 206-211,
// v12.4 lines 218-223), so callers pass both. A subtitle index of -1 asks
// for no subtitle: StreamBuilder finds no stream at that index and burns
// nothing in (StreamBuilder.cs v10.11.7 lines 654-658, v12.4 lines 660-664).
function streamIndices(options: PlaybackPlanOptions): StreamIndexParams {
  const params: StreamIndexParams = {};
  const audio = options.audioStreamIndex;
  const subtitle = options.subtitleStreamIndex;
  if (audio !== undefined && Number.isInteger(audio) && audio >= 0) params.AudioStreamIndex = audio;
  if (subtitle !== undefined && Number.isInteger(subtitle) && subtitle >= -1) params.SubtitleStreamIndex = subtitle;
  return params;
}
