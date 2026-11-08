// Loads trickplay tile images once each and keeps them as blob URLs for the
// life of the player. dispose() frees them and cancels loads in flight.
// How long a failed tile is left alone before a hover may ask for it again.
export const FAILED_TILE_RETRY_MS = 30_000;

export class TileCache {
  private readonly failedAt = new Map<number, number>();
  private readonly urls = new Map<number, string>();
  private readonly loading = new Map<number, Promise<string | undefined>>();
  private readonly abort = new AbortController();

  constructor(private readonly fetchTile: (index: number, signal: AbortSignal) => Promise<Blob>) {}

  peek(index: number): string | undefined {
    return this.urls.get(index);
  }

  // Resolves to undefined when the tile cannot be loaded; previews then simply
  // show no image.
  load(index: number): Promise<string | undefined> {
    const cached = this.urls.get(index);
    if (cached) return Promise.resolve(cached);
    const failed = this.failedAt.get(index);
    if (failed !== undefined && Date.now() - failed < FAILED_TILE_RETRY_MS) return Promise.resolve(undefined);
    const pending = this.loading.get(index);
    if (pending) return pending;
    const started = this.fetchTile(index, this.abort.signal).then(
      (blob) => {
        this.loading.delete(index);
        if (this.abort.signal.aborted) return undefined;
        const url = URL.createObjectURL(blob);
        this.urls.set(index, url);
        return url;
      },
      () => {
        this.loading.delete(index);
        this.failedAt.set(index, Date.now());
        return undefined;
      },
    );
    this.loading.set(index, started);
    return started;
  }

  dispose(): void {
    this.abort.abort();
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    this.loading.clear();
    this.failedAt.clear();
  }
}
