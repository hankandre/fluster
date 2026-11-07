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

export type CardImageType = "Primary" | "Backdrop" | "Thumb";

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
  // Fraction watched, from 0 to 1. Present only for partly watched items.
  progress?: number;
}

export interface LibraryView {
  id: string;
  name: string;
  collectionType: string;
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

// One selectable file of an item. `id` is the MediaSourceId.
export interface ItemVersion {
  id: string;
  name: string;
  container?: string;
  sizeBytes?: number;
  video?: VideoInfo;
  audio: AudioInfo[];
  subtitles: SubtitleInfo[];
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

export interface ItemDetail {
  id: string;
  type: string;
  title: string;
  // The show an episode belongs to, with its season and episode label.
  seriesName?: string;
  episodeLabel?: string;
  year?: number;
  runTimeTicks?: number;
  overview?: string;
  genres: string[];
  cast: CastMember[];
  userData: ItemUserData;
  versions: ItemVersion[];
  poster?: ImageRef;
  backdrop?: ImageRef;
}
