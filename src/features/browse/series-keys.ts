import type { SessionGateway } from "../../app/session";
import { scopeFor } from "../query-scope";

export function seriesNextUpKey(gateway: SessionGateway, seriesId: string) {
  return ["browse", scopeFor(gateway), "series-next-up", seriesId] as const;
}

export function seasonsKey(gateway: SessionGateway, seriesId: string) {
  return ["browse", scopeFor(gateway), "seasons", seriesId] as const;
}

export function episodesKey(gateway: SessionGateway, seriesId: string, seasonId: string) {
  return ["browse", scopeFor(gateway), "episodes", seriesId, seasonId] as const;
}
