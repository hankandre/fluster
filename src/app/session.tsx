import type { BrowsePage, BrowseQuery, CardImageType, EpisodeCard, ItemDetail, NextEpisode, LibraryItem, LibraryView, MediaCard, SearchHint, SearchPage, SearchQuery, Season } from "../domain/catalog";
import type { MediaSegment } from "../domain/media-segments";
import type { PlaybackPlan, PlaybackSnapshot } from "../domain/playback";
import type { RealtimeConnection, ServerEvent } from "../domain/realtime";
import type { ServerConnection } from "../domain/server-connection";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// The narrow gateway surface that feature views may use. Views import this
// type, not the gateway module, so the composition root stays the only place
// that constructs gateways.
export interface SessionGateway {
  readonly serverUrl: string;
  readonly origin: string;
  connect(signal?: AbortSignal): Promise<ServerConnection>;
  confirmUnencryptedConnection(): void;
  login(username: string, password: string, signal?: AbortSignal): Promise<{ userId: string; username: string }>;
  quickConnectEnabled(signal?: AbortSignal): Promise<boolean>;
  initiateQuickConnect(signal?: AbortSignal): Promise<{ secret: string; code: string }>;
  pollQuickConnect(secret: string, signal?: AbortSignal): Promise<{ authenticated: boolean }>;
  authenticateWithQuickConnect(secret: string, signal?: AbortSignal): Promise<{ userId: string; username: string }>;
  logout(): Promise<void>;
  userViews(signal?: AbortSignal): Promise<LibraryView[]>;
  resumeItems(signal?: AbortSignal): Promise<MediaCard[]>;
  nextUp(signal?: AbortSignal): Promise<MediaCard[]>;
  latestInLibrary(parentId: string, signal?: AbortSignal): Promise<MediaCard[]>;
  libraryItems(parentId: string, query: BrowseQuery, signal?: AbortSignal): Promise<BrowsePage>;
  searchHints(term: string, signal?: AbortSignal): Promise<SearchHint[]>;
  searchItems(term: string, query: SearchQuery, signal?: AbortSignal): Promise<SearchPage>;
  seasons(seriesId: string, signal?: AbortSignal): Promise<Season[]>;
  episodes(seriesId: string, seasonId: string, signal?: AbortSignal): Promise<EpisodeCard[]>;
  itemDetail(itemId: string, signal?: AbortSignal): Promise<ItemDetail>;
  // The episode after this one in its series, or undefined for the last one.
  nextEpisode(seriesId: string, episodeId: string, signal?: AbortSignal): Promise<NextEpisode | undefined>;
  trickplayTile(itemId: string, mediaSourceId: string, width: number, index: number, signal?: AbortSignal): Promise<Blob>;
  setPlayed(itemId: string, played: boolean, signal?: AbortSignal): Promise<void>;
  setFavorite(itemId: string, favorite: boolean, signal?: AbortSignal): Promise<void>;
  imageUrl(itemId: string, type: CardImageType, tag: string, maxWidth: number): string;
  createPlaybackPlan(item: LibraryItem, startPositionTicks: number, signal?: AbortSignal, mediaSourceId?: string): Promise<PlaybackPlan>;
  // Intro and outro segments of an item. Call only when the playing version has HasSegments.
  mediaSegments(itemId: string, signal?: AbortSignal): Promise<MediaSegment[]>;
  reportStart(plan: PlaybackPlan, snapshot: PlaybackSnapshot, signal?: AbortSignal): Promise<void>;
  reportProgress(plan: PlaybackPlan, snapshot: PlaybackSnapshot, signal?: AbortSignal): Promise<void>;
  reportStopped(plan: PlaybackPlan, snapshot: PlaybackSnapshot, signal?: AbortSignal, failed?: boolean): Promise<void>;
  // Only for opening the server socket. Never log or store it.
  authorizationHeader(): string;
}

export interface Session {
  // The signed-in gateway, or undefined when signed out.
  gateway: SessionGateway | undefined;
  createGateway(serverUrl: string): SessionGateway;
  signIn(gateway: SessionGateway): void;
  signOut(): Promise<void>;
}

const SessionContext = createContext<Session | undefined>(undefined);

export function SessionProvider({
  createGateway,
  realtime,
  onServerDataChanged,
  children,
}: {
  createGateway: (serverUrl: string) => SessionGateway;
  // The live server connection; omitted where no live refresh is wanted.
  realtime?: RealtimeConnection;
  // Called when another client changed watched state, or after the socket
  // reconnects and changes may have been missed.
  onServerDataChanged?: () => void;
  children: ReactNode;
}) {
  const [gateway, setGateway] = useState<SessionGateway | undefined>();
  useServerSocket(realtime, gateway);
  useServerEvents(realtime, onServerDataChanged);

  const signOut = useCallback(async () => {
    const current = gateway;
    setGateway(undefined);
    await current?.logout();
  }, [gateway]);

  const signIn = useCallback((next: SessionGateway) => {
    // Replacing a signed-in gateway must revoke its server session.
    if (gateway && gateway !== next) void gateway.logout().catch(() => undefined);
    setGateway(next);
  }, [gateway]);

  const session = useMemo<Session>(
    () => ({ gateway, createGateway, signIn, signOut }),
    [gateway, createGateway, signIn, signOut],
  );

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

// Opens the server socket for the signed-in gateway and closes it on sign-out
// or when another gateway replaces it.
function useServerSocket(realtime: RealtimeConnection | undefined, gateway: SessionGateway | undefined) {
  useEffect(() => {
    if (!realtime || !gateway) return;
    let authorization: string;
    try {
      authorization = gateway.authorizationHeader();
    } catch {
      return;
    }
    realtime.connect(gateway.serverUrl, authorization).catch(warnLiveRefreshUnavailable);
    return () => {
      realtime.disconnect().catch(() => undefined);
    };
  }, [realtime, gateway]);
}

function useServerEvents(realtime: RealtimeConnection | undefined, onServerDataChanged: (() => void) | undefined) {
  const onChanged = useRef(onServerDataChanged);
  useEffect(() => {
    onChanged.current = onServerDataChanged;
  }, [onServerDataChanged]);

  useEffect(() => {
    if (!realtime) return;
    let lostConnection = false;
    let stopped = false;
    let unsubscribe: (() => void) | undefined;

    const handle = (event: ServerEvent) => {
      switch (event.kind) {
        case "user-data-changed":
          onChanged.current?.();
          break;
        case "connection":
          if (event.state === "disconnected") {
            lostConnection = true;
          } else if (lostConnection) {
            lostConnection = false;
            onChanged.current?.();
          }
          break;
      }
    };

    realtime.subscribe(handle).then(
      (stop) => {
        if (stopped) stop();
        else unsubscribe = stop;
      },
      warnLiveRefreshUnavailable,
    );
    return () => {
      stopped = true;
      unsubscribe?.();
    };
  }, [realtime]);
}

// The error text is never logged: it is not needed and must not risk carrying
// server details.
function warnLiveRefreshUnavailable() {
  console.warn("Live refresh from the server is unavailable.");
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside SessionProvider.");
  return session;
}
