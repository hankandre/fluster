import { createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Inbox } from "lucide-react";
import { Button, ButtonLink } from "./button";

afterEach(cleanup);

describe("Button", () => {
  it("forwards a ref to the button element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Cancel</Button>);
    expect(ref.current).toBe(screen.getByRole("button", { name: "Cancel" }));
  });

  it("activates with Enter and Space and keeps focus", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button variant="primary" onClick={onClick}>Play</Button>);
    await user.tab();
    expect(screen.getByRole("button", { name: "Play" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Play" })).toHaveFocus();
  });

  it("ignores arrows and Escape", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Retry</Button>);
    await user.tab();
    await user.keyboard("{ArrowRight}{ArrowDown}{Escape}");
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Retry" })).toHaveFocus();
  });

  it("does not activate when disabled and is skipped by Tab", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<><Button disabled onClick={onClick}>Off</Button><Button>On</Button></>);
    await user.tab();
    expect(screen.getByRole("button", { name: "On" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Off" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it.each(["primary", "secondary", "quiet", "danger"] as const)("renders the %s variant as a type=button", (variant) => {
    render(<Button variant={variant}>Label</Button>);
    const button = screen.getByRole("button", { name: "Label" });
    expect(button).toHaveClass(`ui-button--${variant}`);
    expect(button).toHaveAttribute("type", "button");
  });

  it("names an icon button by its aria-label", () => {
    render(<Button variant="icon" aria-label="Favorite"><Inbox aria-hidden="true" /></Button>);
    expect(screen.getByRole("button", { name: "Favorite" })).toHaveClass("ui-button--icon");
  });

  it("renders a link styled as a button that Enter follows", async () => {
    const onClick = vi.fn((event: { preventDefault(): void }) => event.preventDefault());
    const user = userEvent.setup();
    render(<ButtonLink variant="primary" href="#/next/home" onClick={onClick}>Home</ButtonLink>);
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Home" })).toHaveClass("ui-button--primary");
  });
});
