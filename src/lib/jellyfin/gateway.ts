import { Jellyfin, type Api } from "@jellyfin/sdk";
import axios from "axios";
import type { LibraryItem, PlaybackPlan, PlaybackSnapshot } from "../../domain/playback";
import { secondsToTicks } from "../../domain/playback";
import type {
  AuthenticationResult,
  BaseItemDto,
  HttpTransport,
  MediaSourceDto,
  PlaybackInfoResponse,
  ServerInfo,
} from "./types";

const client = new Jellyfin({
  clientInfo: { name: "Fluster", version: "0.1.0" },
  deviceInfo: { name: "Fluster Linux", id: crypto.randomUUID() },
});

function createSdkApi(serverUrl: string, accessToken?: string): Api {
  // The SDK's generated APIs apply basePath and authorization through their
  // Configuration object. Fluster's narrow gateway uses the raw Axios client,
  // so it must provide those values on an isolated instance explicitly.
  const axiosInstance = axios.create({ baseURL: serverUrl });
  const api = client.createApi(serverUrl, accessToken, axiosInstance);
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

function normalizeServerUrl(input: string): string {
  const candidate = input.trim();
  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The server URL must use http:// or https://.");
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

function buildAuthenticatedResourceUrl(serverUrl: string, path: string | null | undefined, accessToken: string): string | undefined {
  if (!path) return undefined;
  const url = new URL(path, `${serverUrl}/`);
  url.searchParams.set("api_key", accessToken);
  return url.toString();
}

export class JellyfinGateway {
  readonly serverUrl: string;
  private transport: HttpTransport;
  private api?: Api;
  private accessToken?: string;
  private userId?: string;

  constructor(serverUrl: string, transport?: HttpTransport) {
    this.serverUrl = normalizeServerUrl(serverUrl);
    this.api = transport ? undefined : createSdkApi(this.serverUrl);
    this.transport = transport ?? (this.api!.axiosInstance as HttpTransport);
  }

  async connect(): Promise<{ name: string; version: string }> {
    const { data } = await this.transport.get<ServerInfo>("/System/Info/Public");
    if (!data || typeof data !== "object" || typeof data.Version !== "string") {
      throw new Error("The server returned an unexpected public-info response. Check the URL and reverse-proxy routing.");
    }
    const version = data.Version;
    if (!/^10\.11(?:\.|$)/.test(version)) {
      throw new Error(`Fluster supports Jellyfin 10.11.x; this server reports ${version}.`);
    }
    return { name: data.ServerName ?? "Jellyfin", version };
  }

  async login(username: string, password: string): Promise<{ username: string }> {
    const { data } = await this.transport.post<AuthenticationResult>("/Users/AuthenticateByName", {
      Username: username,
      Pw: password,
    });
    if (!data.AccessToken || !data.User?.Id) throw new Error("Jellyfin did not return a valid user session.");
    this.accessToken = data.AccessToken;
    this.userId = data.User.Id;
    if (this.api) {
      this.api = createSdkApi(this.serverUrl, data.AccessToken);
      this.transport = this.api.axiosInstance as HttpTransport;
    }
    return { username: data.User.Name ?? username };
  }

  logout(): void {
    this.accessToken = undefined;
    this.userId = undefined;
    if (this.api) {
      this.api = createSdkApi(this.serverUrl);
      this.transport = this.api.axiosInstance as HttpTransport;
    }
  }

  async latest(): Promise<LibraryItem[]> {
    this.requireSession();
    const { data } = await this.transport.get<{ Items?: BaseItemDto[] }>(`/Users/${this.userId}/Items`, {
      params: {
        Recursive: true,
        IncludeItemTypes: "Movie,Episode",
        SortBy: "DateCreated",
        SortOrder: "Descending",
        Limit: 10,
        Fields: "Overview,ProductionYear,RunTimeTicks",
      },
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
      } satisfies LibraryItem];
    }).slice(0, 10);
  }

  async createPlaybackPlan(item: LibraryItem, startPositionTicks = 0): Promise<PlaybackPlan> {
    const { accessToken, userId } = this.requireSession();
    const request = { ...DIRECT_PLAY_REQUEST, UserId: userId, StartTimeTicks: startPositionTicks };
    const { data } = await this.transport.post<PlaybackInfoResponse>(`/Items/${item.id}/PlaybackInfo`, request, {
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

  reportStart(plan: PlaybackPlan, snapshot: PlaybackSnapshot): Promise<void> {
    return this.report("/Sessions/Playing", plan, snapshot);
  }

  reportProgress(plan: PlaybackPlan, snapshot: PlaybackSnapshot): Promise<void> {
    return this.report("/Sessions/Playing/Progress", plan, snapshot);
  }

  reportStopped(plan: PlaybackPlan, snapshot: PlaybackSnapshot): Promise<void> {
    return this.report("/Sessions/Playing/Stopped", plan, snapshot);
  }

  private async report(path: string, plan: PlaybackPlan, snapshot: PlaybackSnapshot): Promise<void> {
    this.requireSession();
    await this.transport.post(path, {
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
    });
  }

  private requireSession(): { accessToken: string; userId: string } {
    if (!this.accessToken || !this.userId) throw new Error("Sign in before using the library.");
    return { accessToken: this.accessToken, userId: this.userId };
  }
}
