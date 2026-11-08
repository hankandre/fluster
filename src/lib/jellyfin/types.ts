export interface ServerInfo {
  ServerName?: string;
  Version?: string;
  Id?: string;
}

export interface AuthenticationResult {
  AccessToken?: string;
  User?: { Id?: string; Name?: string };
}

export interface QuickConnectResult {
  Authenticated?: boolean;
  Secret?: string;
  Code?: string;
}

export interface TrickplayInfoDto {
  Width?: number;
  Height?: number;
  TileWidth?: number;
  TileHeight?: number;
  ThumbnailCount?: number;
  Interval?: number;
}

export interface ChapterInfoDto {
  StartPositionTicks?: number;
  Name?: string | null;
}

export interface BaseItemDto {
  Id?: string;
  Name?: string;
  Type?: string;
  SeriesName?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  ProductionYear?: number;
  RunTimeTicks?: number;
  Overview?: string;
  CollectionType?: string;
  PrimaryImageAspectRatio?: number | null;
  SeriesId?: string | null;
  SeriesPrimaryImageTag?: string | null;
  ImageTags?: Record<string, string | null> | null;
  BackdropImageTags?: string[] | null;
  ImageBlurHashes?: Record<string, Record<string, string | null> | undefined> | null;
  Genres?: string[] | null;
  People?: { Name?: string | null; Role?: string | null; Type?: string }[] | null;
  MediaSources?: MediaSourceDto[] | null;
  Chapters?: ChapterInfoDto[] | null;
  // Keyed by MediaSourceId, then by thumbnail width in pixels.
  Trickplay?: Record<string, Record<string, TrickplayInfoDto> | null> | null;
  UserData?: {
    PlaybackPositionTicks?: number;
    Played?: boolean;
    IsFavorite?: boolean;
  };
}

export interface ItemsResult {
  Items?: BaseItemDto[];
}

export interface SearchHintDto {
  Id?: string;
  Name?: string;
  Type?: string;
  ProductionYear?: number | null;
  Series?: string | null;
}

export interface SearchHintResult {
  SearchHints?: SearchHintDto[];
}

export interface MediaStreamDto {
  Index?: number;
  Type?: string;
  Codec?: string;
  DisplayTitle?: string;
  Language?: string;
  IsExternal?: boolean;
  DeliveryUrl?: string | null;
  // Display-only fields for the detail view.
  Profile?: string | null;
  Width?: number | null;
  Height?: number | null;
  BitDepth?: number | null;
  Channels?: number | null;
  ChannelLayout?: string | null;
  IsDefault?: boolean;
  IsForced?: boolean;
  VideoRange?: string;
  VideoRangeType?: string;
  ColorTransfer?: string | null;
}

export interface MediaSourceDto {
  Id?: string;
  Name?: string;
  Path?: string;
  VideoType?: string;
  Protocol?: string;
  SupportsDirectPlay?: boolean;
  SupportsDirectStream?: boolean;
  TranscodingUrl?: string | null;
  RequiresOpening?: boolean;
  Container?: string;
  Size?: number | null;
  MediaStreams?: MediaStreamDto[];
  DefaultAudioStreamIndex?: number | null;
  DefaultSubtitleStreamIndex?: number | null;
  HasSegments?: boolean;
}

export interface PlaybackInfoResponse {
  MediaSources?: MediaSourceDto[];
  PlaySessionId?: string;
}

export interface HttpRequestConfig {
  responseType?: "blob";
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  signal?: AbortSignal;
  timeout?: number;
}

// `status` is optional so test fakes may omit it; Axios always sets it.
export interface HttpResponse<T> {
  data: T;
  status?: number;
}

export interface HttpTransport {
  get<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
  post<T>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
  delete<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
}
