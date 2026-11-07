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
