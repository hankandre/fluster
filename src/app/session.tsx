import type { CardImageType, LibraryView, MediaCard } from "../domain/catalog";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

// The narrow gateway surface that feature views may use. Views import this
// type, not the gateway module, so the composition root stays the only place
// that constructs gateways.
export interface SessionGateway {
  connect(signal?: AbortSignal): Promise<{ name: string; version: string }>;
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
  imageUrl(itemId: string, type: CardImageType, tag: string, maxWidth: number): string;
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
  children,
}: {
  createGateway: (serverUrl: string) => SessionGateway;
  children: ReactNode;
}) {
  const [gateway, setGateway] = useState<SessionGateway | undefined>();

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

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside SessionProvider.");
  return session;
}
