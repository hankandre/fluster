import type { ItemDetail, LibraryItem } from "../../domain/catalog";
import { resumeChoice } from "../../domain/playback";

// The item shape the playback coordinator and PlayerView take.
export function toPlayableItem(detail: ItemDetail): LibraryItem {
  return {
    id: detail.id,
    name: detail.title,
    type: detail.type === "Episode" ? "Episode" : "Movie",
    seriesName: detail.seriesName,
    productionYear: detail.year,
    runTimeTicks: detail.runTimeTicks,
    overview: detail.overview,
    resumePositionTicks: detail.userData.resumePositionTicks,
    played: detail.userData.played,
  };
}

// Where Resume starts, or undefined when there is nothing to resume.
export function resumeTicksOf(detail: ItemDetail): number | undefined {
  return resumeChoice(toPlayableItem(detail))?.startPositionTicks;
}
