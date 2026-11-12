import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REPORT_FAILED_WARNING } from "../../../lib/player/playstate-reporter";
import { CommandErrorPanel, PlayerWarnings } from "./player-error";

afterEach(cleanup);

describe("CommandErrorPanel", () => {
  it("strips a file path and an rtsp address from the command error", () => {
    const { container } = render(
      <CommandErrorPanel
        message="mpv could not open /home/viewer/Movies/film.mkv or rtsp://10.0.0.5:554/cam1"
        retryLabel="Retry"
        onRetry={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(container).toHaveTextContent("mpv could not open [path] or [address]");
    expect(container).not.toHaveTextContent("/home/viewer");
    expect(container).not.toHaveTextContent("rtsp://");
    expect(container).not.toHaveTextContent("10.0.0.5");
  });
});

describe("PlayerWarnings", () => {
  it("shows plain copy for a failed progress report", () => {
    const { container } = render(<PlayerWarnings softwareDecoding={false} reportingWarning={REPORT_FAILED_WARNING} serverName="Hearth" />);
    expect(container).toHaveTextContent("Couldn't save your progress to Hearth. Playback continues.");
    for (const text of ["Network Error", "Request failed", "timeout of", "Jellyfin progress reporting failed"]) {
      expect(container).not.toHaveTextContent(text);
    }
  });
});
