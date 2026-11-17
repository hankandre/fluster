import { useMemo, useState, type Ref } from "react";
import type { SessionGateway } from "../../app/session";
import { audioPickerView } from "../../domain/audio-picker";
import type { ItemDetail } from "../../domain/catalog";
import { imageUrlFor } from "../card-view";
import { scopeFor } from "../query-scope";
import { seriesRoute } from "../routes";
import { DetailHeader, MediaBadges, PERSON_IMAGE_WIDTH, PersonRow } from "../shared/ui";
import type { ArtSource } from "./art-source";
import { DetailActions, DetailMessages } from "./detail-actions";
import { detailFacts } from "./detail-facts";
import { EpisodeStrip } from "./episode-strip";
import { FileAndStreams } from "./file-and-streams";
import { mediaBadges } from "./media-badges";
import { Overview } from "./overview";
import { useAudioPreference, useSubtitlePreference } from "../shared/account-languages";
import { audioPickerOptions } from "./audio-picker-rows";
import { forgetAudioPick, heldAudioPick, holdAudioPick } from "./audio-pick-store";
import { languageName } from "./format";
import { useFlagMutation } from "./use-flag-mutation";
import { useHeaderArt } from "./use-header-art";

interface DetailBodyProps {
  gateway: SessionGateway;
  item: ItemDetail;
  onArt(art: ArtSource | undefined): void;
  headingRef: Ref<HTMLHeadingElement>;
}

// The loaded page: header, action bar, overview, cast, the season's other episodes, and the file and streams.
export function DetailBody({ gateway, item, onArt, headingRef }: DetailBodyProps) {
  const scope = scopeFor(gateway);
  // A pick held from before the player opened comes back with its version (L8 A: Back keeps it).
  const [restored] = useState(() => {
    const held = heldAudioPick(scope, item.id);
    const version = held && item.versions.find((candidate) => candidate.id === held.mediaSourceId);
    return held && version?.audio.some((track) => track.index === held.audioStreamIndex) ? held : undefined;
  });
  const [chosenId, setChosenId] = useState<string | undefined>(restored?.mediaSourceId);
  const [picked, setPicked] = useState<number | undefined>(restored?.audioStreamIndex);
  const selected = item.versions.find((version) => version.id === chosenId) ?? item.versions[0];
  const played = useFlagMutation(gateway, item.id, "played");
  const favorite = useFlagMutation(gateway, item.id, "favorite");
  const imageUrl = imageUrlFor(gateway);
  const { inlineArt } = useHeaderArt(item, gateway, onArt);
  const { preference, cultures } = useSubtitlePreference(gateway);
  const audioPreference = useAudioPreference(gateway);
  const audioView = useMemo(() => (selected ? audioPickerView(selected.audio, {
    preference: audioPreference.preference,
    cultures: audioPreference.cultures,
    defaultAudioStreamIndex: selected.defaultAudioStreamIndex,
    languageLabel: languageName,
  }) : undefined), [selected, audioPreference.preference, audioPreference.cultures]);
  const audioValue = audioView && (picked !== undefined && audioView.tracks.some((track) => track.index === picked) ? picked : audioView.openingIndex);
  const onVersion = (id: string) => {
    setChosenId(id);
    setPicked(undefined);
    forgetAudioPick();
  };
  const audio = audioView && audioValue !== undefined && selected ? {
    options: audioPickerOptions(audioView),
    value: String(audioValue),
    onChange: (value: string) => {
      const index = Number(value);
      setPicked(index);
      holdAudioPick({ scope, itemId: item.id, mediaSourceId: selected.id, audioStreamIndex: index });
    },
    // What plays follows what the Picker shows; a track the server starts with anyway sends no index (Q1 A).
    routeIndex: audioValue === audioView.serverStartIndex ? undefined : audioValue,
  } : undefined;
  const logo = item.type === "Movie" && item.logo ? { src: imageUrl(item.logo, 800) } : undefined;
  const seriesName = item.seriesName;

  return (
    <>
      <DetailHeader
        title={item.title}
        logo={logo}
        seriesLink={seriesName ? { name: seriesName, ...(item.seriesId ? { href: seriesRoute(item.seriesId) } : {}) } : undefined}
        facts={detailFacts(item)}
        badges={selected ? <MediaBadges badges={mediaBadges(selected)} /> : undefined}
        actions={<DetailActions item={item} selected={selected} onVersion={onVersion} audio={audio} played={played} favorite={favorite} />}
        notice={<DetailMessages />}
        overview={item.overview ? <Overview text={item.overview} /> : undefined}
        inlineArt={inlineArt}
        headingRef={headingRef}
      />
      <div className="detail-body">
        <PersonRow
          people={item.cast.map((member) => ({
            name: member.name,
            ...(member.role ? { role: member.role } : {}),
            ...(member.image ? { imageSrc: imageUrl(member.image, PERSON_IMAGE_WIDTH) } : {}),
          }))}
        />
        <EpisodeStrip gateway={gateway} item={item} />
        <FileAndStreams versions={item.versions} selected={selected} preference={preference} cultures={cultures} />
      </div>
    </>
  );
}
