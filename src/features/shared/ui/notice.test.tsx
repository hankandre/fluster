import { createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Notice } from "./notice";

afterEach(cleanup);

describe("Notice", () => {
  it("renders an h1 with the context, explanation, help, and actions", () => {
    render(
      <Notice title="Playback stopped" context="Arrival" whatYouCanDo={<p>Try another version.</p>} actions={<a href="#/home">Go home</a>}>
        The server stopped the stream.
      </Notice>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Playback stopped" })).toBeInTheDocument();
    expect(screen.getByText("Arrival")).toBeInTheDocument();
    expect(screen.getByText("The server stopped the stream.")).toBeInTheDocument();
    expect(screen.getByText("Try another version.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go home" })).toBeInTheDocument();
  });

  it("can use an h2, and the heading takes focus through headingRef", () => {
    const ref = createRef<HTMLHeadingElement>();
    render(<Notice title="Oops" headingLevel={2} headingRef={ref} actions={null} />);
    expect(screen.getByRole("heading", { level: 2, name: "Oops" })).toBe(ref.current);
    ref.current?.focus();
    expect(ref.current).toHaveFocus();
  });
});
