import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ItemDetail, ItemUserData } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { refreshHomeRows } from "../home";
import { detailKey } from "./detail-key";

type Flag = "played" | "favorite";

// Flips one flag at once, sends it to the server, and puts the old value back
// if the server refuses. Afterwards the item and the home rows refetch.
export function useFlagMutation(gateway: SessionGateway, itemId: string, flag: Flag) {
  const queryClient = useQueryClient();
  const key = detailKey(gateway, itemId);

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
      if (!current || context?.previousValue === undefined) return;
      const userData: ItemUserData = { ...current.userData, [flag]: context.previousValue };
      queryClient.setQueryData<ItemDetail>(key, { ...current, userData });
    },
    onSettled: () => {
      void refreshHomeRows(queryClient);
      // While the other toggle is still in flight, a refetch would show the server's older state.
      if (queryClient.isMutating({ mutationKey: [...key, "flag"] }) > 1) return;
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
