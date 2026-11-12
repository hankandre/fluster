import { Circle, CircleCheck, Heart } from "lucide-react";
import type { ItemDetail, ItemVersion } from "../../domain/catalog";
import { playActivation } from "../card-view";
import { resumeTicksOf } from "../player/playable-item";
import { usePlayerStatus } from "../player/player-status";
import { safeReason } from "../player/safe-reason";
import { playRoute, type PlayRoute } from "../routes";
import { useRovingFocus } from "../roving-focus";
import { ActionBar, Button, ButtonLink, Picker, ProgressRing, ToggleButton } from "../shared/ui";
import { positionLabel } from "./format";
import { versionSummary } from "./media-badges";
import type { useFlagMutation } from "./use-flag-mutation";

type FlagMutation = ReturnType<typeof useFlagMutation>;

interface DetailActionsProps {
  item: ItemDetail;
  selected: ItemVersion | undefined;
  onVersion(id: string): void;
  played: FlagMutation;
  favorite: FlagMutation;
}

// Resume or Play, the version Picker (two or more versions), Start over, then the Watched and Favorite toggles
// (DESIGN.md 7.8 as amended by Q6 A and Q7 A). Each opens the player for the selected version.
export function DetailActions({ item, selected, onVersion, played, favorite }: DetailActionsProps) {
  const resumeTicks = resumeTicksOf(item);
  const startOver: PlayRoute = { itemId: item.id, mediaSourceId: selected?.id, startTicks: 0 };
  const primaryRoute: PlayRoute = resumeTicks === undefined ? startOver : { ...startOver, startTicks: resumeTicks };
  const fraction = resumeTicks !== undefined && item.runTimeTicks ? resumeTicks / item.runTimeTicks : undefined;

  return (
    <ActionBar>
      <ButtonLink
        variant="primary"
        href={playRoute(primaryRoute)}
        onClick={playActivation(primaryRoute)}
        data-roving-item=""
        icon={fraction !== undefined ? <ProgressRing value={fraction} /> : undefined}
      >
        {resumeTicks === undefined ? "Play" : `Resume from ${positionLabel(resumeTicks)}`}
      </ButtonLink>
      {item.versions.length > 1 ? (
        <Picker
          label="Version"
          hideLabel
          appearance="pill"
          rovingItem
          options={item.versions.map((version) => ({ value: version.id, label: version.name, description: versionSummary(version) }))}
          value={selected?.id}
          onChange={onVersion}
        />
      ) : null}
      {resumeTicks !== undefined ? (
        <ButtonLink variant="secondary" href={playRoute(startOver)} onClick={playActivation(startOver)} data-roving-item="">
          Start over
        </ButtonLink>
      ) : null}
      <ToggleButton
        label="Watched"
        pressed={item.userData.played}
        iconOff={Circle}
        iconOn={CircleCheck}
        aria-disabled={played.isPending}
        data-roving-item=""
        onPressedChange={(value) => {
          if (!played.isPending) played.mutate(value);
        }}
      />
      <ToggleButton
        label="Favorite"
        pressed={item.userData.favorite}
        iconOff={Heart}
        iconOn={Heart}
        filledWhenOn
        aria-disabled={favorite.isPending}
        data-roving-item=""
        onPressedChange={(value) => {
          if (!favorite.isPending) favorite.mutate(value);
        }}
      />
    </ActionBar>
  );
}

// Said before Play is pressed: the player cannot start. The player route repeats the reason.
export function DetailMessages() {
  const { status, recheck } = usePlayerStatus();
  const roving = useRovingFocus<HTMLDivElement>("row", { spatial: true });
  return (
    <>
      {status.kind === "unavailable" ? (
        <div className="detail-message">
          <p role="alert">The player cannot start, so Play will fail: {safeReason(status.reason)}</p>
          <div data-spatial-row="" ref={roving.ref} onKeyDown={roving.onKeyDown} onFocus={roving.onFocus}>
            <Button variant="quiet" data-roving-item="" onClick={recheck}>Check again</Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
