import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inbox } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { EmptyState } from "./empty-state";
import { useRovingFocus } from "../../roving-focus";
import { InlineError } from "./inline-error";
import { Skeleton } from "./skeleton";
import { readFileSync } from "node:fs";

afterEach(cleanup);

describe("EmptyState", () => {
  it("shows an icon, a heading, a sentence, and one action", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(
      <EmptyState icon={Inbox} title="Nothing to watch yet" action={<Button variant="secondary" onClick={onAction}>Open settings</Button>}>
        Your libraries don't have any movies or shows.
      </EmptyState>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Nothing to watch yet" })).toBeInTheDocument();
    expect(screen.getByText("Your libraries don't have any movies or shows.")).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole("button", { name: "Open settings" })).toHaveFocus();
    await user.keyboard("{Enter}{ArrowDown}{Escape}");
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Open settings" })).toHaveFocus();
  });

  it("works without an action and can be a level 3 heading", () => {
    render(<EmptyState icon={Inbox} title="No matches" headingLevel={3} />);
    expect(screen.getByRole("heading", { level: 3, name: "No matches" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("InlineError", () => {
  it("announces the sentence and retries with Enter, keeping focus on Retry", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<InlineError message="Couldn't load Latest in Movies." onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load Latest in Movies.");
    await user.tab();
    expect(screen.getByRole("button", { name: "Retry" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowRight}{Escape}");
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Retry" })).toHaveFocus();
  });

  it("shows no button without a retry handler", () => {
    render(<InlineError message="Couldn't load this." />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("Skeleton", () => {
  it("is hidden from assistive technology and never takes focus", async () => {
    const user = userEvent.setup();
    const { container } = render(<><Skeleton shape="line" width="10rem" /><Skeleton aspectRatio="2 / 3" width="var(--poster-w)" /><button type="button">After</button></>);
    const blocks = container.querySelectorAll(".ui-skeleton");
    expect(blocks).toHaveLength(2);
    blocks.forEach((block) => expect(block).toHaveAttribute("aria-hidden", "true"));
    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    await user.keyboard("{ArrowDown}{Escape}");
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  });
});

const feedbackCss = readFileSync("src/features/shared/ui/feedback.css", "utf8");

describe("Skeleton shape", () => {
  it("lets an aspect-ratio block take its height from the ratio, not the default bar height", () => {
    const { container } = render(<><Skeleton aspectRatio="2 / 3" width="var(--poster-w)" /><Skeleton width="10rem" /><Skeleton aspectRatio="2 / 3" height="4rem" /></>);
    const [poster, bar, fixed] = Array.from(container.querySelectorAll<HTMLElement>(".ui-skeleton"));
    expect(poster).toHaveAttribute("data-ratio");
    expect(poster.style.aspectRatio).toBe("2 / 3");
    expect(bar).not.toHaveAttribute("data-ratio");
    expect(fixed).not.toHaveAttribute("data-ratio");
    expect(feedbackCss).toMatch(/\.ui-skeleton\[data-ratio\]\s*\{\s*height:\s*auto;/);
  });
});

function PrimaryRow() {
  const roving = useRovingFocus<HTMLDivElement>("row", { spatial: true });
  return (
    <div data-spatial-row="" ref={roving.ref} onKeyDown={roving.onKeyDown} onFocus={roving.onFocus}>
      <button type="button" data-roving-item="">Primary</button>
    </div>
  );
}

describe("InlineError spatial", () => {
  it("makes Retry a spatial row of its own that Down and Up reach", () => {
    render(
      <main>
        <PrimaryRow />
        <InlineError spatial message="Couldn't load your next episode." onRetry={vi.fn()} />
      </main>,
    );
    const primary = screen.getByRole("button", { name: "Primary" });
    primary.focus();
    fireEvent.keyDown(primary, { key: "ArrowDown" });
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry).toHaveFocus();
    fireEvent.keyDown(retry, { key: "ArrowUp" });
    expect(primary).toHaveFocus();
  });

  it("leaves Retry out of the spatial rows by default", () => {
    render(<InlineError message="Couldn't load." onRetry={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Retry" })).not.toHaveAttribute("data-roving-item");
  });
});
