import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextField } from "./text-field";

afterEach(cleanup);

describe("TextField", () => {
  it("labels the input and focuses it from the label", async () => {
    const user = userEvent.setup();
    render(<TextField label="Server URL" />);
    await user.click(screen.getByText("Server URL"));
    expect(screen.getByLabelText("Server URL")).toHaveFocus();
  });

  it("links the hint and the error with aria-describedby", () => {
    render(<TextField label="Server URL" hint="Include http or https." error="That address didn't answer." />);
    const input = screen.getByLabelText("Server URL");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("That address didn't answer. Include http or https.");
  });

  it("announces its error as an alert", () => {
    render(<TextField label="Server URL" error="That address didn't answer." />);
    expect(screen.getByRole("alert")).toHaveTextContent("That address didn't answer.");
  });

  it("has no description or invalid flag without a hint or error", () => {
    render(<TextField label="Username" />);
    const input = screen.getByLabelText("Username");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("submits its form with Enter, edits with arrows, and keeps its text on Escape", async () => {
    const onSubmit = vi.fn((event: { preventDefault(): void }) => event.preventDefault());
    const user = userEvent.setup();
    render(<form onSubmit={onSubmit}><TextField label="Username" defaultValue="sam" /></form>);
    const input = screen.getByLabelText("Username");
    await user.click(input);
    await user.keyboard("{ArrowLeft}{Escape}");
    expect(input).toHaveValue("sam");
    expect(input).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("only offers text-like input types", () => {
    render(<TextField label="Password" type="password" />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });
});
