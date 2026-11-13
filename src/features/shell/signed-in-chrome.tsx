import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession, type SessionGateway } from "../../app/session";
import { scopeFor } from "../query-scope";
import { AppNav, AppShell } from "../shared/ui";
import { useBackKey } from "./use-back-key";
import { useSearchShortcut } from "./use-search-shortcut";

// Wraps signed-in pages in the app shell. While signed out it renders the page alone.
export function SignedInChrome({ hash, children }: { hash: string; children: ReactNode }) {
  const { gateway } = useSession();
  if (!gateway) return <>{children}</>;
  return <NavShell gateway={gateway} hash={hash}>{children}</NavShell>;
}

function NavShell({ gateway, hash, children }: { gateway: SessionGateway; hash: string; children: ReactNode }) {
  useSearchShortcut();
  useBackKey();
  const views = useQuery({
    queryKey: ["nav", scopeFor(gateway), "views"],
    queryFn: ({ signal }) => gateway.userViews(signal),
    gcTime: 0,
  });
  // Pending or failed: only the fixed entries show, with no placeholder and no error text.
  const libraries = views.data?.map((view) => ({ id: view.id, name: view.name }));
  return <AppShell nav={<AppNav libraries={libraries} hash={hash} userInitial={initialOf(gateway.currentUserName())} />}>{children}</AppShell>;
}

// The first letter of the user's name, upper-cased, or undefined for an empty name.
export function initialOf(name: string | undefined): string | undefined {
  const first = Array.from(name?.trim() ?? "")[0];
  return first ? first.toLocaleUpperCase() : undefined;
}
