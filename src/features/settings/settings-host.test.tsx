import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ToastProvider } from "../shared/ui";
import { SettingsHostProvider, useSettingsHost } from "./settings-host";

afterEach(cleanup);

function Probe() {
  const host = useSettingsHost();
  return <button onClick={() => host.confirm("Saved.", "Row")}>{host.place}</button>;
}

it("without a provider confirms with a toast", () => {
  render(
    <ToastProvider>
      <Probe />
    </ToastProvider>,
  );
  act(() => screen.getByRole("button", { name: "page" }).click());
  expect(screen.getByText("Saved.")).toBeInTheDocument();
});

it("with a provider confirms through the host and shows no toast", () => {
  const confirm = vi.fn();
  render(
    <ToastProvider>
      <SettingsHostProvider host={{ place: "player", confirm }}>
        <Probe />
      </SettingsHostProvider>
    </ToastProvider>,
  );
  act(() => screen.getByRole("button", { name: "player" }).click());
  expect(confirm).toHaveBeenCalledWith("Saved.", "Row");
  expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
});
