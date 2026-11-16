import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession, type SessionGateway } from "../../app/session";
import type { ItemDetail, ItemVersion } from "../../domain/catalog";
import { fakeSessionGateway } from "../../test/fake-session-gateway";
import { ToastProvider } from "../shared/ui";
import { forgetAudioPick } from "./audio-pick-store";
import { ItemDetailView } from "./index";

// P17-08: the audio Picker beside the version Picker, and the play links that follow it.
const multi: ItemVersion = {
  id: "src-a",
  name: "Original",
  video: { codec: "h264", width: 1920, height: 1080, bitDepth: 8, hdr: "SDR" },
  audio: [
    { index: 1, language: "eng", codec: "aac", channels: 2, isDefault: true },
    { index: 2, language: "spa", codec: "ac3", channels: 6, isDefault: false },
    { index: 3, language: "fra", codec: "aac", channels: 2, isDefault: false },
  ],
  defaultAudioStreamIndex: 1,
  subtitles: [],
};
const other: ItemVersion = {
  id: "src-b",
  name: "Compact",
  audio: [
    { index: 1, language: "eng", codec: "aac", channels: 2, isDefault: true },
    { index: 2, language: "deu", codec: "aac", channels: 2, isDefault: false },
  ],
  defaultAudioStreamIndex: 1,
  subtitles: [],
};
const single: ItemVersion = { id: "src-c", name: "One", audio: [{ index: 1, language: "eng", codec: "aac", isDefault: true }], subtitles: [] };

function detail(versions: ItemVersion[]): ItemDetail {
  return {
    id: "m1",
    type: "Movie",
    title: "Arrival",
    genres: [],
    cast: [],
    userData: { played: false, favorite: false, resumePositionTicks: 0 },
    versions,
  };
}

function gatewayFor(versions: ItemVersion[], languages: Record<string, unknown> = {}): SessionGateway {
  return fakeSessionGateway({
    itemDetail: vi.fn().mockResolvedValue(detail(versions)),
    accountLanguages: vi.fn().mockResolvedValue(languages),
  });
}

// Mounts and unmounts the page inside one signed-in session, as the router does going to the player and back.
function Toggle() {
  const [shown, setShown] = useState(true);
  return (
    <>
      <button onClick={() => setShown((value) => !value)}>test toggle page</button>
      {shown ? <ItemDetailView itemId="m1" /> : null}
    </>
  );
}

function SignIn({ gateway }: { gateway: SessionGateway }) {
  const session = useSession();
  return <button onClick={() => session.signIn(gateway)}>test sign in</button>;
}

async function renderDetail(gateway: SessionGateway) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ToastProvider>
      <QueryClientProvider client={client}>
        <SessionProvider createGateway={() => gateway}>
          <SignIn gateway={gateway} />
          <Toggle />
        </SessionProvider>
      </QueryClientProvider>
    </ToastProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "test sign in" }));
  });
}

const audioTrigger = () => screen.findByRole("button", { name: /^Audio/ });

beforeEach(() => {
  window.location.hash = "#/next/item/m1";
});

afterEach(() => {
  cleanup();
  forgetAudioPick();
});

describe("the audio Picker", () => {
  it("is absent with one audio track", async () => {
    await renderDetail(gatewayFor([single]));
    await screen.findByRole("link", { name: "Play" });
    expect(screen.queryByRole("button", { name: /^Audio/ })).not.toBeInTheDocument();
  });

  it("opens on the server's start track, and Play links to today's route", async () => {
    await renderDetail(gatewayFor([multi]));
    expect(await audioTrigger()).toHaveTextContent("English · AAC Stereo");
    expect(screen.getByRole("link", { name: "Play" })).toHaveAttribute("href", "#/next/play/m1?source=src-a");
  });

  it("opens on the preferred language, lists it first, and Play carries the shown track", async () => {
    await renderDetail(gatewayFor([multi], { audioLanguage: "fra" }));
    await waitFor(async () => expect(await audioTrigger()).toHaveTextContent("French"));
    await userEvent.click(await audioTrigger());
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options[0]).toContain("French");
    expect(options.slice(1).map((text) => text?.split("AAC")[0]?.split("AC-3")[0]?.trim())).toEqual(["English", "Spanish"]);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("link", { name: "Play" })).toHaveAttribute("href", "#/next/play/m1?source=src-a&audio=3");
  });

  it("a pick goes on Play, Resume, and Start over", async () => {
    const userData = { played: false, favorite: false, resumePositionTicks: 7_540_000_000 };
    const gateway = fakeSessionGateway({
      itemDetail: vi.fn().mockResolvedValue({ ...detail([multi]), userData }),
    });
    await renderDetail(gateway);
    await userEvent.click(await audioTrigger());
    await userEvent.click(screen.getByRole("option", { name: /^Spanish/ }));
    expect(screen.getByRole("link", { name: "Resume from 12:34" })).toHaveAttribute("href", "#/next/play/m1?source=src-a&audio=2&start=7540000000");
    expect(screen.getByRole("link", { name: "Start over" })).toHaveAttribute("href", "#/next/play/m1?source=src-a&audio=2");
  });

  it("choosing the track the server starts with sends no index", async () => {
    await renderDetail(gatewayFor([multi]));
    await userEvent.click(await audioTrigger());
    await userEvent.click(screen.getByRole("option", { name: /^Spanish/ }));
    await userEvent.click(await audioTrigger());
    await userEvent.click(screen.getByRole("option", { name: /^English/ }));
    expect(screen.getByRole("link", { name: "Play" })).toHaveAttribute("href", "#/next/play/m1?source=src-a");
  });

  it("choosing another version resets the pick to that version's opening track", async () => {
    await renderDetail(gatewayFor([multi, other]));
    await userEvent.click(await audioTrigger());
    await userEvent.click(screen.getByRole("option", { name: /^Spanish/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Version/ }));
    await userEvent.click(screen.getByRole("option", { name: /^Compact/ }));
    expect(await audioTrigger()).toHaveTextContent("English");
    expect(screen.getByRole("link", { name: "Play" })).toHaveAttribute("href", "#/next/play/m1?source=src-b");
  });

  it("keeps the pick and its version when the page returns from the player, and forgets it elsewhere", async () => {
    const gateway = gatewayFor([multi, other]);
    await renderDetail(gateway);
    const toggle = () => userEvent.click(screen.getByRole("button", { name: "test toggle page" }));
    const goTo = (hash: string) => {
      window.location.hash = hash;
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    };
    await userEvent.click(await screen.findByRole("button", { name: /^Version/ }));
    await userEvent.click(screen.getByRole("option", { name: /^Compact/ }));
    await userEvent.click(await audioTrigger());
    await userEvent.click(screen.getByRole("option", { name: /^German/ }));

    goTo("#/next/play/m1?source=src-b&audio=2");
    await toggle();
    goTo("#/next/item/m1");
    await toggle();
    expect(await audioTrigger()).toHaveTextContent("German");
    expect(screen.getByRole("link", { name: "Play" })).toHaveAttribute("href", "#/next/play/m1?source=src-b&audio=2");

    goTo("#/next/home");
    await toggle();
    goTo("#/next/item/m1");
    await toggle();
    expect(await audioTrigger()).toHaveTextContent("English");
    expect(screen.getByRole("link", { name: "Play" })).toHaveAttribute("href", "#/next/play/m1?source=src-a");
  });

  it("writes nothing to storage and never saves the account", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const gateway = gatewayFor([multi]);
    await renderDetail(gateway);
    await userEvent.click(await audioTrigger());
    const stateBefore = JSON.stringify(window.history.state);
    await userEvent.click(screen.getByRole("option", { name: /^Spanish/ }));
    expect(setItem).not.toHaveBeenCalled();
    expect(JSON.stringify(window.history.state)).toBe(stateBefore);
    setItem.mockRestore();
  });
});
