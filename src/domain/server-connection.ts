import type { HostClass } from "./host-class";

// What the unauthenticated probe (`GET /System/Info/Public`) learned.
export interface ServerConnection {
  name: string;
  version: string;
  hostClass: HostClass;
  // True for a private-LAN HTTP server the user has not yet confirmed at this
  // origin (docs/decisions/0001). Sign-in is refused until they confirm.
  needsUnencryptedConfirmation: boolean;
}
