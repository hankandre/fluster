import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inbox } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { EmptyState } from "./empty-state";
import { InlineError } from "./inline-error";
import { Skeleton } from "./skeleton";

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
