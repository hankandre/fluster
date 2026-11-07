import type { BrowseCard, CardImageType, EpisodeCard, ImageRef, LibraryView, MediaCard, Season } from "../../domain/catalog";
import type { BaseItemDto } from "./types";

const POSTER_ASPECT_RATIO = 2 / 3;
const BACKDROP_ASPECT_RATIO = 16 / 9;

function itemImage(item: BaseItemDto, itemId: string): { image: ImageRef; aspectRatio: number } | undefined {
  const primaryTag = item.ImageTags?.Primary;
  if (primaryTag) {
    return {
      image: imageRef(itemId, "Primary", primaryTag, item.ImageBlurHashes?.Primary?.[primaryTag]),
      aspectRatio: item.PrimaryImageAspectRatio ?? POSTER_ASPECT_RATIO,
    };
  }
  // An episode without its own picture shows the series poster.
  if (item.SeriesId && item.SeriesPrimaryImageTag) {
    return {
      image: imageRef(
        item.SeriesId,
        "Primary",
        item.SeriesPrimaryImageTag,
        item.ImageBlurHashes?.Primary?.[item.SeriesPrimaryImageTag],
      ),
      aspectRatio: POSTER_ASPECT_RATIO,
    };
  }
  const backdropTag = item.BackdropImageTags?.[0];
  if (backdropTag) {
    return {
      image: imageRef(itemId, "Backdrop", backdropTag, item.ImageBlurHashes?.Backdrop?.[backdropTag]),
      aspectRatio: BACKDROP_ASPECT_RATIO,
    };
  }
  return undefined;
}

function imageRef(itemId: string, type: CardImageType, tag: string, blurHash?: string | null): ImageRef {
  return blurHash ? { itemId, type, tag, blurHash } : { itemId, type, tag };
}

function watchedFraction(item: BaseItemDto): number | undefined {
  const position = item.UserData?.PlaybackPositionTicks ?? 0;
  const length = item.RunTimeTicks ?? 0;
  if (position <= 0 || length <= 0) return undefined;
  return Math.min(1, position / length);
}

function episodeLabel(item: BaseItemDto): string {
  const numbers = item.ParentIndexNumber != null && item.IndexNumber != null
    ? `S${item.ParentIndexNumber}E${item.IndexNumber} · `
    : "";
  return `${numbers}${item.Name ?? ""}`;
}

export function toMediaCard(item: BaseItemDto): MediaCard | undefined {
  if (!item.Id || !item.Name) return undefined;
  const isEpisode = item.Type === "Episode";
  const found = itemImage(item, item.Id);
  const subtitle = isEpisode ? episodeLabel(item) : item.ProductionYear?.toString();
  return {
    id: item.Id,
    title: isEpisode ? item.SeriesName ?? item.Name : item.Name,
    ...(subtitle ? { subtitle } : {}),
    ...(found ? { image: found.image } : {}),
    aspectRatio: found?.aspectRatio ?? POSTER_ASPECT_RATIO,
    ...(watchedFraction(item) !== undefined ? { progress: watchedFraction(item) } : {}),
  };
}

export function toMediaCards(items: BaseItemDto[] | undefined): MediaCard[] {
  return (items ?? []).flatMap((item) => toMediaCard(item) ?? []);
}

const HOME_COLLECTION_TYPES = new Set(["movies", "tvshows", "boxsets"]);

export function toHomeLibraries(items: BaseItemDto[] | undefined): LibraryView[] {
  return (items ?? []).flatMap((item) => {
    if (!item.Id || !item.Name || !item.CollectionType) return [];
    return HOME_COLLECTION_TYPES.has(item.CollectionType) ? [{ id: item.Id, name: item.Name, collectionType: item.CollectionType }] : [];
  });
}

function browseKind(type: string | undefined): BrowseCard["kind"] {
  switch (type) {
    case "Movie":
    case "Series":
    case "BoxSet":
      return type;
    default:
      return "Other";
  }
}

export function toBrowseCards(items: BaseItemDto[] | undefined): BrowseCard[] {
  return (items ?? []).flatMap((item) => {
    const card = toMediaCard(item);
    return card ? [{ ...card, kind: browseKind(item.Type) }] : [];
  });
}

export function toSeasons(items: BaseItemDto[] | undefined): Season[] {
  return (items ?? []).flatMap((item) => (item.Id && item.Name ? [{ id: item.Id, name: item.Name, collectionType: item.CollectionType }] : []));
}

export function toEpisodeCards(items: BaseItemDto[] | undefined): EpisodeCard[] {
  return (items ?? []).flatMap((item) => {
    const card = toMediaCard(item);
    if (!card || !item.Name) return [];
    const { subtitle: _unused, ...rest } = card;
    return [{
      ...rest,
      title: item.Name,
      ...(item.IndexNumber != null ? { subtitle: `Episode ${item.IndexNumber}` } : {}),
      ...(item.Overview ? { overview: item.Overview } : {}),
    }];
  });
}
