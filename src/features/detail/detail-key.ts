import type { SessionGateway } from "../../app/session";
import { scopeFor } from "../query-scope";

export function detailKey(gateway: SessionGateway, itemId: string) {
  return ["detail", scopeFor(gateway), itemId] as const;
}
