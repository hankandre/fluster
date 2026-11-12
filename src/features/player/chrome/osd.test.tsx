import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Osd } from "./osd";
import { OSD_MS, OSD_NOTICE_MS } from "./timing";
import { useOsd } from "./use-osd";

function Harness({ onShow }: { onShow(show: ReturnType<typeof useOsd>["show"]): void }) {
  const { message, show } = useOsd();
  onShow(show);
  return <Osd message={message} />;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

function setup() {
  let show!: ReturnType<typeof useOsd>["show"];
  render(<Harness onShow={(value) => { show = value; }} />);
  return { show: (text: string, kind?: "key" | "notice") => act(() => show(text, kind)) };
}

describe("Osd", () => {
  it("is a mounted, empty status until a message arrives", () => {
    setup();
    const status = screen.getByRole("status", { name: "Player message" });
    expect(status).toBeEmptyDOMElement();
  });

  it("shows one message, replaces it, and restarts the timer", () => {
    const { show } = setup();
    show("+10 s");
    expect(screen.getByRole("status")).toHaveTextContent("+10 s");
    act(() => vi.advanceTimersByTime(OSD_MS - 200));
    show("Muted");
    expect(screen.getByRole("status")).toHaveTextContent("Muted");
    expect(screen.getByRole("status")).not.toHaveTextContent("+10 s");
    act(() => vi.advanceTimersByTime(OSD_MS - 200));
    expect(screen.getByRole("status")).toHaveTextContent("Muted");
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("keeps a notice longer, with the conversion mark", () => {
    const { show } = setup();
    show("Converting on server: x", "notice");
    act(() => vi.advanceTimersByTime(OSD_MS + 100));
    expect(screen.getByRole("status")).toHaveTextContent("Converting on server: x");
    expect(screen.getByRole("status")).toHaveAttribute("data-kind", "notice");
    act(() => vi.advanceTimersByTime(OSD_NOTICE_MS));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
