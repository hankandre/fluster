import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { Picker } from "./picker";
import { SettingsPage, SettingsRow, SettingsSection, useSettingsRow } from "./settings";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SECTIONS = [
  { id: "playback", label: "Playback" },
  { id: "subtitles", label: "Subtitles" },
  { id: "account", label: "Account" },
];

function PickerInRow() {
  const { descriptionId } = useSettingsRow();
  const [value, setValue] = useState("a");
  return (
    <Picker
      label="Limit"
      hideLabel
      options={[{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }]}
      value={value}
      onChange={setValue}
      rovingItem
      openOnArrow={false}
      describedBy={descriptionId}
    />
  );
}

function Panel({ id }: { id: string }) {
  switch (id) {
    case "playback":
      return (
        <SettingsSection title="Playback" intro="How it plays.">
          <SettingsRow label="Limit" description="Servers nearby."><PickerInRow /></SettingsRow>
          <SettingsRow label="Action"><Button data-roving-item="">Do it</Button></SettingsRow>
          <SettingsRow label="Passthrough" unavailable="P5-03" />
        </SettingsSection>
      );
    case "subtitles":
      return <SettingsSection title="Subtitles" intro="Follows your account." />;
    default:
      return (
        <SettingsSection title="Account">
          <SettingsRow label="User" value="Tester" />
        </SettingsSection>
      );
  }
}

function Harness({ initial = "playback" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <SettingsPage label="Settings sections" sections={SECTIONS} value={value} onChange={setValue}>
      <Panel id={value} />
    </SettingsPage>
  );
}

const tab = (name: string) => screen.getByRole("tab", { name });

describe("SettingsPage on medium windows", () => {
  it("is a vertical, labelled tablist wired to one panel", () => {
    render(<Harness />);
    const list = screen.getByRole("tablist", { name: "Settings sections" });
    expect(list).toHaveAttribute("aria-orientation", "vertical");
    expect(within(list).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Playback", "Subtitles", "Account"]);
    expect(tab("Playback")).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel", { name: "Playback" });
    expect(tab("Playback")).toHaveAttribute("aria-controls", panel.id);
    expect(tab("Subtitles")).not.toHaveAttribute("aria-controls");
    expect(within(panel).getByRole("heading", { level: 2, name: "Playback" })).toBeInTheDocument();
  });

  it("has one Tab stop, on the selected tab", () => {
    render(<Harness initial="subtitles" />);
    expect(tab("Subtitles")).toHaveAttribute("tabindex", "0");
    expect(tab("Playback")).toHaveAttribute("tabindex", "-1");
    expect(tab("Account")).toHaveAttribute("tabindex", "-1");
  });

  it("moves and selects with ArrowDown, ArrowUp, Home, and End", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    tab("Playback").focus();
    await user.keyboard("{ArrowDown}");
    expect(tab("Subtitles")).toHaveFocus();
    expect(tab("Subtitles")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { level: 2, name: "Subtitles" })).toBeInTheDocument();
    await user.keyboard("{End}");
    expect(tab("Account")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(tab("Account")).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(tab("Subtitles")).toHaveFocus();
    await user.keyboard("{Home}");
    expect(tab("Playback")).toHaveFocus();
    expect(tab("Playback")).toHaveAttribute("aria-selected", "true");
  });

  it("enters the rows with ArrowRight and returns with ArrowLeft", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    tab("Playback").focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: /^Limit/ })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(tab("Playback")).toHaveFocus();
  });

  it("keeps focus on the tab when the panel has no row control", async () => {
    const user = userEvent.setup();
    render(<Harness initial="subtitles" />);
    tab("Subtitles").focus();
    await user.keyboard("{ArrowRight}");
    expect(tab("Subtitles")).toHaveFocus();
  });

  it("does not take ArrowLeft from an open list", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    tab("Playback").focus();
    await user.keyboard("{ArrowRight}{Enter}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("option", { name: "Alpha" })).toHaveFocus();
  });

  it("does nothing on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    tab("Playback").focus();
    await user.keyboard("{Escape}");
    expect(tab("Playback")).toHaveFocus();
    expect(screen.getByRole("heading", { level: 2, name: "Playback" })).toBeInTheDocument();
  });
});

describe("SettingsRow", () => {
  it("shows the label and description, and describes the control by the description", () => {
    render(<Harness />);
    expect(screen.getByText("Limit", { selector: ".settings-row-label" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Limit/ })).toHaveAccessibleDescription("Servers nearby.");
  });

  it("shows a value as read-only text", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(tab("Account"));
    expect(screen.getByText("Tester")).toBeInTheDocument();
  });

  it("shows an unavailable row disabled, with the reason and nothing focusable", () => {
    const { container } = render(<Harness />);
    const row = container.querySelector<HTMLElement>('[data-unbuilt="P5-03"]')!;
    expect(row).toHaveAttribute("aria-disabled", "true");
    expect(row).toHaveTextContent("Passthrough");
    expect(row).toHaveTextContent("Not available yet.");
    expect(row.querySelector("button, a, input, [tabindex]")).toBeNull();
  });

  it("moves between row controls with ArrowDown and ArrowUp, and opens a Picker with Enter only", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const picker = screen.getByRole("button", { name: /^Limit/ });
    picker.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Do it" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(picker).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("makes the row one Tab stop", () => {
    render(<Harness />);
    const stops = screen.getAllByRole("button").filter((button) => button.getAttribute("tabindex") === "0" && !button.matches("[role=tab]"));
    expect(stops).toHaveLength(1);
  });
});

describe("SettingsPage on compact windows", () => {
  function compact() {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(max-width: 719px)",
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  }

  it("lists the sections as buttons, with no tablist", () => {
    compact();
    render(<Harness />);
    expect(screen.queryByRole("tablist")).toBeNull();
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["Playback", "Subtitles", "Account"]);
  });

  it("opens a section with Enter and focuses its heading", async () => {
    compact();
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("button", { name: "Account" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { level: 2, name: "Account" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Back to settings" })).toBeInTheDocument();
  });

  it("returns on Escape and on Back, with focus on that section's button", async () => {
    compact();
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Subtitles" }));
    expect(screen.getByRole("heading", { level: 2, name: "Subtitles" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Subtitles" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Account" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to settings" }));
    expect(screen.getByRole("button", { name: "Account" })).toHaveFocus();
  });

  it("does not leave the section on Escape while a list is open", async () => {
    compact();
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Playback" }));
    screen.getByRole("button", { name: /^Limit/ }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("heading", { level: 2, name: "Playback" })).toBeInTheDocument();
  });

  it("does not prevent Escape while no section is open", () => {
    compact();
    render(<Harness />);
    const button = screen.getByRole("button", { name: "Account" });
    button.focus();
    expect(fireEvent.keyDown(button, { key: "Escape" })).toBe(true);
  });
});
