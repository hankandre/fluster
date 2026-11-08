import { useRef, useState, type ReactNode } from "react";
import { Heart, Inbox, Play, Trash2, TriangleAlert } from "lucide-react";
import {
  Button,
  Dialog,
  EmptyState,
  InlineError,
  Picker,
  SegmentedTabPanel,
  SegmentedTabs,
  Skeleton,
  TextField,
  ToastProvider,
  ToggleChip,
  useToast,
  type PickerOption,
} from "../shared/ui";
import "./gallery.css";

// Browser development only (App.tsx). The marker below lets the build check prove it never ships.
export const GALLERY_MARKER = "FLUSTER_UI_GALLERY";

const LIMITS: PickerOption[] = [
  { value: "none", label: "No limit" },
  { value: "40", label: "40 Mbps", description: "Good for a fast home network" },
  { value: "20", label: "20 Mbps" },
  { value: "8", label: "8 Mbps", description: "Not available on this connection", disabled: true },
];

const SEASONS = [
  { id: "s1", label: "Season 1" },
  { id: "s2", label: "Season 2" },
  { id: "sp", label: "Specials" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="gallery-section" aria-label={title}>
      <h2>{title}</h2>
      <div className="gallery-row">{children}</div>
    </section>
  );
}

function Gallery() {
  const toast = useToast();
  const [limit, setLimit] = useState("40");
  const [season, setSeason] = useState("s1");
  const [manualSeason, setManualSeason] = useState("s1");
  const [watched, setWatched] = useState(true);
  const [unwatched, setUnwatched] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);

  return (
    <main className="gallery" data-gallery={GALLERY_MARKER}>
      <h1>UI gallery</h1>
      <p className="gallery-lede">Every shared primitive and its states. Browser development only.</p>

      <Section title="Buttons">
        <Button variant="primary" icon={<Play aria-hidden="true" size={18} />}>Play</Button>
        <Button variant="secondary">Start over</Button>
        <Button variant="quiet">Hide</Button>
        <Button variant="danger">Sign out</Button>
        <Button variant="icon" aria-label="Favorite"><Heart aria-hidden="true" size={20} /></Button>
        <Button variant="primary" disabled>Disabled primary</Button>
        <Button variant="secondary" disabled>Disabled secondary</Button>
        <Button variant="icon" aria-label="Delete (disabled)" disabled><Trash2 aria-hidden="true" size={20} /></Button>
      </Section>

      <Section title="Text fields">
        <TextField label="Server URL" placeholder="http://192.168.1.10:8096" hint="Include http or https." />
        <TextField label="Username" defaultValue="sam" />
        <TextField label="Password" type="password" error="That username and password didn't work." defaultValue="secret" />
        <TextField label="Disabled" disabled defaultValue="Read only" />
      </Section>

      <Section title="Picker">
        <Picker label="Streaming limit" options={LIMITS} value={limit} onChange={setLimit} />
        <Picker label="Nothing chosen" options={LIMITS} value={undefined} onChange={setLimit} placeholder="Choose a limit" />
        <Picker label="Disabled picker" options={LIMITS} value="20" onChange={setLimit} disabled />
      </Section>

      <Section title="Segmented tabs">
        <div className="gallery-stack">
          <SegmentedTabs label="Seasons" items={SEASONS} value={season} onChange={setSeason} idBase="gallery-seasons" />
          <SegmentedTabPanel idBase="gallery-seasons" id={season}>Episodes of {SEASONS.find((item) => item.id === season)?.label}</SegmentedTabPanel>
        </div>
        <div className="gallery-stack">
          <SegmentedTabs label="Settings sections (manual)" items={SEASONS} value={manualSeason} onChange={setManualSeason} activation="manual" idBase="gallery-manual" />
          <SegmentedTabPanel idBase="gallery-manual" id={manualSeason}>Section {manualSeason}</SegmentedTabPanel>
        </div>
      </Section>

      <Section title="Toggle chips">
        <ToggleChip pressed={unwatched} onPressedChange={setUnwatched}>Unwatched</ToggleChip>
        <ToggleChip pressed={watched} onPressedChange={setWatched}>Favorites</ToggleChip>
        <ToggleChip pressed={false} onPressedChange={() => undefined} disabled>In progress</ToggleChip>
      </Section>

      <Section title="Dialog and toasts">
        <Button variant="secondary" onClick={() => setConfirmOpen(true)}>Open dialog</Button>
        <Button variant="secondary" onClick={() => toast.show({ message: "Marked as watched", tone: "ok", action: { label: "Undo", onAction: () => undefined } })}>Show toast</Button>
        <Button variant="secondary" onClick={() => toast.show({ message: "Couldn't update watched state.", tone: "error" })}>Show error toast</Button>
        <Dialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="Connect without encryption?"
          icon={<TriangleAlert size={24} />}
          initialFocus={cancel}
          actions={
            <>
              <Button ref={cancel} variant="quiet" onClick={() => setConfirmOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => setConfirmOpen(false)}>Connect</Button>
            </>
          }
        >
          Your password would cross this network unencrypted. Only continue on a network you trust.
        </Dialog>
      </Section>

      <Section title="Empty state and inline error">
        <EmptyState icon={Inbox} title="Nothing to watch yet" action={<Button variant="secondary">Open settings</Button>}>
          Your libraries don't have any movies or shows. Add media in Jellyfin, then come back.
        </EmptyState>
        <InlineError message="Couldn't load Latest in Movies." onRetry={() => undefined} />
      </Section>

      <Section title="Skeleton">
        <Skeleton aspectRatio="2 / 3" width="var(--poster-w)" />
        <Skeleton aspectRatio="16 / 9" width="var(--thumb-w)" />
        <div className="gallery-stack">
          <Skeleton shape="line" width="12rem" />
          <Skeleton shape="line" width="8rem" />
        </div>
        <Skeleton shape="circle" width="var(--icon-button)" height="var(--icon-button)" />
      </Section>
    </main>
  );
}

export function GalleryView() {
  return (
    <ToastProvider>
      <Gallery />
    </ToastProvider>
  );
}
