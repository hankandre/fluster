import type { BrowseCard, CardImageType, EpisodeCard, ImageRef, LibraryView, MediaCard, NextEpisode, SearchCard, SearchHint, SearchKind, Season } from "../../domain/catalog";
import type { BaseItemDto, SearchHintDto } from "./types";

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

// The item's own Logo or Thumb, else the parent's (episodes show the series
// logo and the parent thumb).
export function logoAndThumb(item: BaseItemDto, itemId: string): { logo?: ImageRef; thumb?: ImageRef } {
  const hashes = item.ImageBlurHashes;
  const logoTag = item.ImageTags?.Logo;
  const thumbTag = item.ImageTags?.Thumb;
  const logo = logoTag
    ? imageRef(itemId, "Logo", logoTag, hashes?.Logo?.[logoTag])
    : item.ParentLogoItemId && item.ParentLogoImageTag
      ? imageRef(item.ParentLogoItemId, "Logo", item.ParentLogoImageTag, hashes?.Logo?.[item.ParentLogoImageTag])
      : undefined;
  const thumb = thumbTag
    ? imageRef(itemId, "Thumb", thumbTag, hashes?.Thumb?.[thumbTag])
    : item.ParentThumbItemId && item.ParentThumbImageTag
      ? imageRef(item.ParentThumbItemId, "Thumb", item.ParentThumbImageTag, hashes?.Thumb?.[item.ParentThumbImageTag])
      : undefined;
  return { ...(logo ? { logo } : {}), ...(thumb ? { thumb } : {}) };
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

function itemKind(type: string | undefined): MediaCard["kind"] {
  switch (type) {
    case "Movie":
    case "Series":
    case "Episode":
    case "BoxSet":
      return type;
    default:
      return "Other";
  }
}

export function toMediaCard(item: BaseItemDto): MediaCard | undefined {
  if (!item.Id || !item.Name) return undefined;
  const isEpisode = item.Type === "Episode";
  const found = itemImage(item, item.Id);
  const subtitle = isEpisode ? episodeLabel(item) : item.ProductionYear?.toString();
  return {
    id: item.Id,
    kind: itemKind(item.Type),
    title: isEpisode ? item.SeriesName ?? item.Name : item.Name,
    ...(subtitle ? { subtitle } : {}),
    ...(found ? { image: found.image } : {}),
    aspectRatio: found?.aspectRatio ?? POSTER_ASPECT_RATIO,
    ...logoAndThumb(item, item.Id),
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
  return (items ?? []).flatMap((item) => (item.Id && item.Name ? [{ id: item.Id, name: item.Name, ...(item.IndexNumber != null ? { indexNumber: item.IndexNumber } : {}) }] : []));
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

function searchKind(type: string | undefined): SearchKind | undefined {
  switch (type) {
    case "Movie":
    case "Series":
    case "Episode":
      return type;
    default:
      return undefined;
  }
}

export function toSearchHints(hints: SearchHintDto[] | undefined): SearchHint[] {
  return (hints ?? []).flatMap((hint) => {
    const kind = searchKind(hint.Type);
    if (!hint.Id || !hint.Name || !kind) return [];
    return [{
      id: hint.Id,
      name: hint.Name,
      kind,
      ...(hint.ProductionYear != null ? { year: hint.ProductionYear } : {}),
      ...(hint.Series ? { seriesName: hint.Series } : {}),
    }];
  });
}

export function toSearchCards(items: BaseItemDto[] | undefined): SearchCard[] {
  return (items ?? []).flatMap((item) => {
    const card = toMediaCard(item);
    const kind = searchKind(item.Type);
    return card && kind ? [{ ...card, kind }] : [];
  });
}

// The episode a player offers next. An entry without an ID or name is not one.
export function toNextEpisode(item: BaseItemDto | undefined): NextEpisode | undefined {
  if (!item?.Id || !item.Name) return undefined;
  const label = item.ParentIndexNumber != null && item.IndexNumber != null
    ? `S${item.ParentIndexNumber}E${item.IndexNumber}`
    : undefined;
  return { id: item.Id, title: item.Name, ...(label ? { label } : {}) };
}
