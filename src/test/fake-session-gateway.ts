import { vi } from "vitest";
import type { SessionGateway } from "../app/session";

// A complete SessionGateway of vi.fn()s. Every test stub builds on this, so a
// new gateway method is added in one place. Pass overrides for the methods a
// test cares about.
export function fakeSessionGateway(overrides: Partial<SessionGateway> = {}): SessionGateway {
  return {
    serverUrl: "https://media.test",
    origin: "https://media.test",
    connect: vi.fn(),
    confirmUnencryptedConnection: vi.fn(),
    login: vi.fn(),
    quickConnectEnabled: vi.fn(),
    initiateQuickConnect: vi.fn(),
    pollQuickConnect: vi.fn(),
    authenticateWithQuickConnect: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    userViews: vi.fn(),
    resumeItems: vi.fn(),
    nextUp: vi.fn(),
    latestInLibrary: vi.fn(),
    libraryItems: vi.fn(),
    searchHints: vi.fn(),
    searchItems: vi.fn(),
    seasons: vi.fn(),
    episodes: vi.fn(),
    itemDetail: vi.fn(),
    trickplayTile: vi.fn(),
    setPlayed: vi.fn(),
    setFavorite: vi.fn(),
    imageUrl: vi.fn(() => "https://media.test/img.webp"),
    createPlaybackPlan: vi.fn(),
    reportStart: vi.fn().mockResolvedValue(undefined),
    reportProgress: vi.fn().mockResolvedValue(undefined),
    reportStopped: vi.fn().mockResolvedValue(undefined),
    authorizationHeader: vi.fn(() => 'MediaBrowser Token="test-token"'),
    ...overrides,
  };
}
