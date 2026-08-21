export interface ServerInfo {
  ServerName?: string;
  Version?: string;
  Id?: string;
}

export interface AuthenticationResult {
  AccessToken?: string;
  User?: { Id?: string; Name?: string };
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
}

export interface MediaStreamDto {
  Index?: number;
  Type?: string;
  DisplayTitle?: string;
  Language?: string;
  IsExternal?: boolean;
  DeliveryUrl?: string | null;
}

export interface MediaSourceDto {
  Id?: string;
  Path?: string;
  Protocol?: string;
  SupportsDirectPlay?: boolean;
  SupportsDirectStream?: boolean;
  TranscodingUrl?: string;
  Container?: string;
  MediaStreams?: MediaStreamDto[];
}

export interface PlaybackInfoResponse {
  MediaSources?: MediaSourceDto[];
  PlaySessionId?: string;
}

export interface HttpTransport {
  get<T>(url: string, config?: { params?: Record<string, unknown> }): Promise<{ data: T }>;
  post<T>(url: string, data?: unknown, config?: { params?: Record<string, unknown> }): Promise<{ data: T }>;
}
