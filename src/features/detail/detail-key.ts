import type { SessionGateway } from "../../app/session";
import { scopeFor } from "../query-scope";

export function detailKey(gateway: SessionGateway, itemId: string) {
  return ["detail", scopeFor(gateway), itemId] as const;
}

export function seasonEpisodesKey(gateway: SessionGateway, seriesId: string, seasonId: string) {
  return ["detail", scopeFor(gateway), "season-episodes", seriesId, seasonId] as const;
}
