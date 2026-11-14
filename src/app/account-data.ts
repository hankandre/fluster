import type { QueryClient } from "@tanstack/react-query";
import { dropOtherAccounts } from "../features/query-scope";
import { resetFocusReturn } from "../features/shell/focus-return";
import type { SessionGateway } from "./session";

// Everything the app keeps in memory for an account, dropped when the signed-in account changes or signs out:
// cached screen data and the focus and scroll records of the history entries.
export function resetAccountData(queryClient: QueryClient, gateway: SessionGateway | undefined): void {
  dropOtherAccounts(queryClient, gateway);
  resetFocusReturn();
}
