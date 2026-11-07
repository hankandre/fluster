import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ItemDetail, ItemUserData } from "../../domain/catalog";
import type { SessionGateway } from "../../app/session";
import { refreshHomeRows } from "../home";
import { detailKey } from "./detail-key";

type Flag = "played" | "favorite";

// Flips one flag at once, sends it to the server, and puts the old value back
// if the server refuses. Afterwards the item and the home rows refetch.
function useFlagMutation(gateway: SessionGateway, itemId: string, flag: Flag) {
  const queryClient = useQueryClient();
  const key = detailKey(gateway, itemId);

  return useMutation({
    mutationFn: (value: boolean) => (flag === "played" ? gateway.setPlayed(itemId, value) : gateway.setFavorite(itemId, value)),
    onMutate: async (value: boolean) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ItemDetail>(key);
      if (previous) {
        const userData: ItemUserData = { ...previous.userData, [flag]: value };
        queryClient.setQueryData<ItemDetail>(key, { ...previous, userData });
      }
      return { previous };
    },
    onError: (_error, _value, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void refreshHomeRows(queryClient);
    },
  });
}

export function WatchState({ gateway, item }: { gateway: SessionGateway; item: ItemDetail }) {
  const played = useFlagMutation(gateway, item.id, "played");
  const favorite = useFlagMutation(gateway, item.id, "favorite");

  return (
    <div className="detail-actions">
      <button
        type="button"
        aria-pressed={item.userData.played}
        disabled={played.isPending}
        onClick={() => played.mutate(!item.userData.played)}
      >
        Watched
      </button>
      <button
        type="button"
        aria-pressed={item.userData.favorite}
        disabled={favorite.isPending}
        onClick={() => favorite.mutate(!item.userData.favorite)}
      >
        Favorite
      </button>
      {played.isError ? <p role="alert">Could not update watched state. Try again.</p> : null}
      {favorite.isError ? <p role="alert">Could not update favorite. Try again.</p> : null}
    </div>
  );
}
