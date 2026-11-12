import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ItemDetail, ItemUserData } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { refreshHomeRows } from "../home";
import { useToast } from "../shared/ui";
import { detailKey } from "./detail-key";

type Flag = "played" | "favorite";

const TOASTS = {
  played: { on: "Marked as watched.", off: "Marked as unwatched.", failed: "Couldn't update watched state. Try again." },
  favorite: { on: "Added to favorites.", off: "Removed from favorites.", failed: "Couldn't update favorite. Try again." },
} as const;

// Flips one flag at once, sends it to the server, and puts the old value back
// if the server refuses, and says what happened in a toast (one per flag). Afterwards the item and the home rows refetch.
export function useFlagMutation(gateway: SessionGateway, itemId: string, flag: Flag) {
  const queryClient = useQueryClient();
  const key = detailKey(gateway, itemId);
  const toast = useToast();
  const lastToast = useRef<number | undefined>(undefined);
  const say = (message: string, tone: "ok" | "error") => {
    if (lastToast.current !== undefined) toast.dismiss(lastToast.current);
    lastToast.current = toast.show({ message, tone });
  };

  return useMutation({
    mutationKey: [...key, "flag"],
    mutationFn: (value: boolean) => (flag === "played" ? gateway.setPlayed(itemId, value) : gateway.setFavorite(itemId, value)),
    onMutate: async (value: boolean) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ItemDetail>(key);
      if (previous) {
        const userData: ItemUserData = { ...previous.userData, [flag]: value };
        queryClient.setQueryData<ItemDetail>(key, { ...previous, userData });
      }
      return { previousValue: previous?.userData[flag] };
    },
    // Restore only this flag; the other one may have changed since.
    onError: (_error, _value, context) => {
      const current = queryClient.getQueryData<ItemDetail>(key);
      if (current && context?.previousValue !== undefined) {
        const userData: ItemUserData = { ...current.userData, [flag]: context.previousValue };
        queryClient.setQueryData<ItemDetail>(key, { ...current, userData });
      }
      say(TOASTS[flag].failed, "error");
    },
    onSuccess: (_data, value) => say(value ? TOASTS[flag].on : TOASTS[flag].off, "ok"),
    onSettled: () => {
      void refreshHomeRows(queryClient);
      // While the other toggle is still in flight, a refetch would show the server's older state.
      if (queryClient.isMutating({ mutationKey: [...key, "flag"] }) > 1) return;
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
