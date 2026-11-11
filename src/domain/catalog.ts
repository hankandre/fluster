export interface LibraryItem {
  id: string;
  name: string;
  type: "Movie" | "Episode";
  seriesName?: string;
  season?: number;
  episode?: number;
  productionYear?: number;
  runTimeTicks?: number;
  overview?: string;
  resumePositionTicks: number;
  played: boolean;
}

// Home-screen types. Cards carry only what a row renders.

export type CardImageType = "Primary" | "Backdrop" | "Thumb" | "Logo";

// Identifies one image by item, type, and tag. A tagged image never changes,
// so this is also the cache key.
export interface ImageRef {
  itemId: string;
  type: CardImageType;
  tag: string;
  blurHash?: string;
}

export type ItemKind = "Movie" | "Series" | "Episode" | "BoxSet" | "Other";

export interface MediaCard {
  id: string;
  // Decides where the card links. Absent when the kind is not known.
  kind?: ItemKind;
  title: string;
  subtitle?: string;
  image?: ImageRef;
  // Width divided by height of the image.
  aspectRatio: number;
  // Title logo and 16:9 thumbnail. An episode without its own falls back to
  // the parent's (series logo, parent thumb).
  logo?: ImageRef;
  thumb?: ImageRef;
  // The item's own backdrop, independent of `image`.
  backdrop?: ImageRef;
  // The parent's backdrop, only when the item has none of its own.
  parentBackdrop?: ImageRef;
  // Ticks to resume from. Present only when not played and the position is above zero.
  resumePositionTicks?: number;
  // Episodes only, and only when the server sent both numbers.
  seasonNumber?: number;
  episodeNumber?: number;
  // Fraction watched, from 0 to 1. Present only for partly watched items.
  progress?: number;
  // Ticks left to watch. Present whenever `progress` is.
  remainingTicks?: number;
  // Present (true) only when the item is fully watched.
  played?: boolean;
  // Unwatched episodes of a series. Present only when above zero.
  unplayedCount?: number;
}

export interface LibraryView {
  id: string;
  name: string;
  collectionType: string;
  image?: ImageRef;
}

// Browse types.

export type BrowseSortBy = "SortName" | "DateCreated" | "PremiereDate" | "CommunityRating";
export type BrowseSortOrder = "Ascending" | "Descending";
export type BrowseFilter = "IsUnplayed" | "IsFavorite" | "IsResumable";

export type BrowseItemType = "Movie" | "Series" | "BoxSet";

export interface BrowseQuery {
  itemTypes: BrowseItemType[];
  startIndex: number;
  limit: number;
  sortBy: BrowseSortBy;
  sortOrder: BrowseSortOrder;
  filters: BrowseFilter[];
}

// A card in a library or collection grid. Series and BoxSet cards link on.
export interface BrowseCard extends MediaCard {
  kind: "Movie" | "Series" | "BoxSet" | "Other";
}

export interface BrowsePage {
  cards: BrowseCard[];
  hasMore: boolean;
}

export interface Season {
  id: string;
  name: string;
  // 0 is Specials.
  indexNumber?: number;
}

export interface EpisodeCard extends MediaCard {
  overview?: string;
}

export type SearchKind = "Movie" | "Series" | "Episode";

// One type-ahead suggestion from /Search/Hints.
export interface SearchHint {
  id: string;
  name: string;
  kind: SearchKind;
  year?: number;
  // The show an episode belongs to.
  seriesName?: string;
}

export interface SearchQuery {
  startIndex: number;
  limit: number;
}

// A search result card. Episodes carry their own kind so the page can group by type.
export interface SearchCard extends MediaCard {
  kind: SearchKind;
}

export interface SearchPage {
  cards: SearchCard[];
  hasMore: boolean;
}

// Item detail types. Versions are display data; playback negotiation decides
// whether a version can play.

export type DynamicRange =
  | "SDR"
  | "HDR"
  | "HDR10"
  | "HDR10+"
  | "HLG"
  | "Dolby Vision"
  | "Dolby Vision / HDR10"
  | "Dolby Vision / HDR10+"
  | "Dolby Vision / HLG"
  | "Dolby Vision / SDR"
  | "Unknown";

export interface VideoInfo {
  codec?: string;
  profile?: string;
  width?: number;
  height?: number;
  bitDepth?: number;
  hdr: DynamicRange;
}

export interface AudioInfo {
  language?: string;
  codec?: string;
  channels?: number;
  channelLayout?: string;
  title?: string;
  isDefault: boolean;
}

export interface SubtitleInfo {
  language?: string;
  codec?: string;
  title?: string;
  isExternal: boolean;
  isDefault: boolean;
  isForced: boolean;
}

// Where the preview thumbnails of one version live. Thumbnails are packed
// into tile images of tileWidth x tileHeight thumbnails each, one thumbnail
// every intervalMs of playback.
export interface TrickplayInfo {
  // Width and height in pixels of one thumbnail; also the width path segment of the tile URL.
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  thumbnailCount: number;
  intervalMs: number;
}

export interface Chapter {
  startSeconds: number;
  name: string;
}

// One selectable file of an item. `id` is the MediaSourceId.
export interface ItemVersion {
  id: string;
  name: string;
  container?: string;
  sizeBytes?: number;
  video?: VideoInfo;
  audio: AudioInfo[];
  subtitles: SubtitleInfo[];
  trickplay?: TrickplayInfo;
}

export interface CastMember {
  name: string;
  role?: string;
}

export interface ItemUserData {
  played: boolean;
  favorite: boolean;
  resumePositionTicks: number;
}

// The server has no such item for this user: deleted, or the link is stale.
export class ItemNotFoundError extends Error {
  constructor() {
    super("This item no longer exists.");
    this.name = "ItemNotFoundError";
  }
}

// The episode that follows the one being played.
export interface NextEpisode {
  id: string;
  title: string;
  // For example "S1E2"; absent when the server sent no numbers.
  label?: string;
}

export interface ItemDetail {
  id: string;
  type: string;
  title: string;
  // The show an episode belongs to, with its season and episode numbers (episodes only).
  seriesId?: string;
  seriesName?: string;
  seasonId?: string;
  seasonName?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  year?: number;
  runTimeTicks?: number;
  overview?: string;
  genres: string[];
  cast: CastMember[];
  userData: ItemUserData;
  versions: ItemVersion[];
  chapters?: Chapter[];
  poster?: ImageRef;
  backdrop?: ImageRef;
  logo?: ImageRef;
  thumb?: ImageRef;
}
