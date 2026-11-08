import { useRef, useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { Picker } from "./picker";

function Harness({ safeFirst = false, closeOnVeil = true }: { safeFirst?: boolean; closeOnVeil?: boolean }) {
  const [open, setOpen] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Connect without encryption?"
        initialFocus={safeFirst ? cancel : undefined}
        closeOnVeil={closeOnVeil}
        actions={
          <>
            <Button ref={cancel} variant="quiet" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>Connect</Button>
          </>
        }
      >
        Anyone on this network could read your password.
      </Dialog>
    </>
  );
}

afterEach(cleanup);

describe("Dialog", () => {
  it("opens as a labelled modal and focuses its first control", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "Connect without encryption?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Anyone on this network could read your password.");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("focuses the element named by initialFocus", async () => {
    const user = userEvent.setup();
    render(<Harness safeFirst />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("makes the page behind inert while open and restores it", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(container).toHaveAttribute("inert");
    await user.keyboard("{Escape}");
    expect(container).not.toHaveAttribute("inert");
  });

  it("closes on Escape and returns focus to the opener", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await user.click(opener);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("closes through an action and returns focus to the opener", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await user.click(opener);
    await user.keyboard("{Tab}{Enter}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("traps Tab and Shift+Tab inside the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.tab();
    expect(screen.getByRole("button", { name: "Connect" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Connect" })).toHaveFocus();
  });

  it("ignores arrows and Enter on the panel itself", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.keyboard("{ArrowDown}{ArrowRight}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes on a veil press unless turned off", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();

    render(<Harness closeOnVeil={false} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(screen.getByRole("dialog").parentElement!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("lets a Picker inside close on Escape without closing the dialog", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog open onClose={onClose} title="Streaming">
        <Picker label="Limit" options={[{ value: "a", label: "A" }]} value="a" onChange={() => undefined} />
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: /Limit/ }));
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Limit/ })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Escape working after a veil press with closeOnVeil off", async () => {
    const user = userEvent.setup();
    render(<Harness closeOnVeil={false} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(screen.getByRole("dialog").parentElement!);
    expect(screen.getByRole("dialog")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape when focus has dropped to the page", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await user.click(opener);
    (document.activeElement as HTMLElement).blur();
    expect(document.body).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("brings focus back into the dialog on Tab from the page", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    (document.activeElement as HTMLElement).blur();
    await user.keyboard("{Tab}");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("makes a portal added while open inert, unless it is exempt", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const late = document.body.appendChild(document.createElement("div"));
    const exempt = document.body.appendChild(document.createElement("div"));
    exempt.setAttribute("data-dialog-exempt", "");
    await waitFor(() => expect(late).toHaveAttribute("inert"));
    expect(exempt).not.toHaveAttribute("inert");
    await user.keyboard("{Escape}");
    expect(late).not.toHaveAttribute("inert");
    late.remove();
    exempt.remove();
  });

  it("renders a Picker list outside the scrolling panel and keeps it usable", async () => {
    const user = userEvent.setup();
    render(
      <Dialog open onClose={() => undefined} title="Streaming">
        <Picker label="Limit" options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} value="a" onChange={() => undefined} />
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: /Limit/ }));
    const list = screen.getByRole("listbox");
    expect(screen.getByRole("dialog").contains(list)).toBe(false);
    expect(list.closest("[inert]")).toBeNull();
    expect(screen.getByRole("option", { name: "A" })).toHaveFocus();
  });
});
